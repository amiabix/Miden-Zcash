use actix_web::{web, App, HttpServer, HttpResponse, Result};
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use anyhow::{Context, Result as AnyhowResult};
use zcash_proofs::prover::LocalTxProver;
use zcash_primitives::{
    sapling::{
        keys::{ExpandedSpendingKey, OutgoingViewingKey},
        Diversifier, MerklePath, PaymentAddress, Rseed,
        redjubjub::PublicKey,
        value::ValueCommitment,
        prover::TxProver,
        Note,
    },
    constants::SPENDING_KEY_GENERATOR,
};
// Use types from zcash_primitives dependencies to avoid version conflicts

#[derive(Deserialize)]
struct SpendProofRequest {
    spending_key: Vec<u8>,  // ask (32 bytes)
    nsk: Vec<u8>,           // nsk (32 bytes) - required
    value: String,
    rcv: Vec<u8>,
    alpha: Vec<u8>,
    anchor: Vec<u8>,
    merkle_path: Vec<Vec<u8>>,
    position: String,
}

#[derive(Deserialize)]
struct OutputProofRequest {
    value: String,
    rcv: Vec<u8>,
    rcm: Vec<u8>,
    diversifier: Vec<u8>,
    pk_d: Vec<u8>,
    esk: Option<Vec<u8>>,
}

#[derive(Serialize)]
struct ProofResponse {
    proof: Vec<u8>,
    cv: Vec<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rk: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cmu: Option<Vec<u8>>,
}

struct AppState {
    prover: Arc<LocalTxProver>,
}

async fn health() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "zcash-proving-service",
        "version": "0.1.0"
    })))
}

async fn prove_spend(
    req: web::Json<SpendProofRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse> {
    match generate_spend_proof_internal(req.into_inner(), &state.prover).await {
        Ok(response) => Ok(HttpResponse::Ok().json(response)),
        Err(e) => {
            eprintln!("Spend proof generation error: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Proof generation failed: {}", e)
            })))
        }
    }
}

async fn prove_output(
    req: web::Json<OutputProofRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse> {
    match generate_output_proof_internal(req.into_inner(), &state.prover).await {
        Ok(response) => Ok(HttpResponse::Ok().json(response)),
        Err(e) => {
            eprintln!("Output proof generation error: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Proof generation failed: {}", e)
            })))
        }
    }
}

async fn generate_spend_proof_internal(
    req: SpendProofRequest,
    prover: &LocalTxProver,
) -> AnyhowResult<ProofResponse> {
    // Parse inputs
    let value = req.value.parse::<u64>()
        .context("Invalid value")?;
    let position = req.position.parse::<u64>()
        .context("Invalid position")?;
    
    // Validate input lengths
    if req.spending_key.len() != 32 {
        anyhow::bail!("spending_key (ask) must be 32 bytes");
    }
    if req.nsk.len() != 32 {
        anyhow::bail!("nsk must be 32 bytes");
    }
    if req.rcv.len() != 32 {
        anyhow::bail!("rcv must be 32 bytes");
    }
    if req.alpha.len() != 32 {
        anyhow::bail!("alpha must be 32 bytes");
    }
    if req.anchor.len() != 32 {
        anyhow::bail!("anchor must be 32 bytes");
    }
    
    // Convert ask to Fr (jubjub::Fr from zcash_primitives dependency)
    use jubjub::Fr;
    let ask = bytes_to_fr(&req.spending_key)?;
    
    // Convert nsk
    let nsk = bytes_to_fr(&req.nsk)?;
    
    // Create ExpandedSpendingKey from ask, nsk, and zero ovk
    // Note: ovk is not needed for proof generation, only for outgoing viewing
    let ovk = OutgoingViewingKey([0u8; 32]);
    let expsk = ExpandedSpendingKey { ask, nsk, ovk };
    
    // Get proof generation key
    let proof_generation_key = expsk.proof_generation_key();
    
    // Convert alpha to jubjub::Fr for ar (randomization)
    use jubjub::Fr as JubjubFr;
    let ar = bytes_to_fr(&req.alpha)?;
    
    // Convert anchor to bls12_381::Scalar
    use bls12_381::Scalar;
    let anchor = bytes_to_scalar(&req.anchor)?;
    
    // Build MerklePath from input
    // Each path element is a 32-byte node
    // Node is exported from sapling module (not tree submodule)
    use zcash_primitives::sapling::{Node, note::ExtractedNoteCommitment};
    let mut path_elems = Vec::new();
    for (i, path_elem) in req.merkle_path.iter().enumerate() {
        if path_elem.len() != 32 {
            anyhow::bail!("Merkle path element {} must be 32 bytes", i);
        }
        let mut elem = [0u8; 32];
        elem.copy_from_slice(path_elem);
        // Create ExtractedNoteCommitment from bytes, then Node from that
        // from_bytes returns CtOption, so we need to unwrap it
        let cmu_opt = ExtractedNoteCommitment::from_bytes(&elem);
        let cmu = if cmu_opt.is_some().into() {
            cmu_opt.unwrap()
        } else {
            anyhow::bail!("Invalid merkle path element {} - not a valid commitment", i);
        };
        path_elems.push(Node::from_cmu(&cmu));
    }
    
    // MerklePath is a type alias for incrementalmerkletree::MerklePath
    // Use Position from incrementalmerkletree 0.4 (matching zcash_primitives version)
    use incrementalmerkletree::Position;
    let pos = Position::from(position);
    let merkle_path = MerklePath::from_parts(path_elems, pos)
        .map_err(|_| anyhow::anyhow!("Failed to create MerklePath - invalid position or path length"))?;
    
    // For spend proofs, we need diversifier and rseed
    // Use default diversifier and generate rseed from rcv
    let diversifier = Diversifier([0u8; 11]);
    let rcv_fr = bytes_to_fr(&req.rcv)?;
    let rseed = Rseed::BeforeZip212(rcv_fr);
    
    // Create proving context
    let mut ctx = prover.new_sapling_proving_context();
    
    // Generate the spend proof
    let (proof_bytes, cv, rk) = prover.spend_proof(
        &mut ctx,
        proof_generation_key,
        diversifier,
        rseed,
        ar,
        value,
        anchor,
        merkle_path,
    )
    .map_err(|_| anyhow::anyhow!("Proof generation failed - check inputs (anchor, merkle path, etc.)"))?;
    
    // Convert rk to bytes
    use group::GroupEncoding;
    let rk_bytes = rk.0.to_bytes();
    
    Ok(ProofResponse {
        proof: proof_bytes.to_vec(),
        cv: cv.to_bytes().to_vec(),
        rk: Some(rk_bytes.to_vec()),
        cmu: None,
    })
}

async fn generate_output_proof_internal(
    req: OutputProofRequest,
    prover: &LocalTxProver,
) -> AnyhowResult<ProofResponse> {
    // Parse inputs
    let value = req.value.parse::<u64>()
        .context("Invalid value")?;
    
    // Validate input lengths
    if req.rcv.len() != 32 {
        anyhow::bail!("rcv must be 32 bytes");
    }
    if req.rcm.len() != 32 {
        anyhow::bail!("rcm must be 32 bytes");
    }
    if req.diversifier.len() != 11 {
        anyhow::bail!("diversifier must be 11 bytes");
    }
    if req.pk_d.len() != 32 {
        anyhow::bail!("pk_d must be 32 bytes");
    }
    
    // Convert diversifier
    let mut diversifier_bytes = [0u8; 11];
    diversifier_bytes.copy_from_slice(&req.diversifier[..]);
    let diversifier = Diversifier(diversifier_bytes);
    
    // Convert pk_d to PaymentAddress
    // PaymentAddress::from_bytes takes 43 bytes: 11 bytes diversifier + 32 bytes pk_d
    let mut address_bytes = [0u8; 43];
    address_bytes[..11].copy_from_slice(&req.diversifier[..]);
    address_bytes[11..].copy_from_slice(&req.pk_d[..]);
    
    // Use PaymentAddress::from_bytes which internally uses DiversifiedTransmissionKey::from_bytes
    let payment_address = PaymentAddress::from_bytes(&address_bytes)
        .ok_or_else(|| anyhow::anyhow!("Failed to create payment address from bytes"))?;
    
    // Convert rcm to jubjub::Fr
    use jubjub::Fr as JubjubFr2;
    let rcm = bytes_to_fr(&req.rcm)?;
    
    // Convert esk (or generate if not provided)
    let esk = if let Some(esk_bytes) = req.esk {
        if esk_bytes.len() != 32 {
            anyhow::bail!("esk must be 32 bytes if provided");
        }
        bytes_to_fr(&esk_bytes)?
    } else {
        // Generate random esk
        use rand_core::OsRng;
        use group::ff::Field;
        JubjubFr2::random(&mut OsRng)
    };
    
    // Create proving context
    let mut ctx = prover.new_sapling_proving_context();
    
    // Generate the output proof
    let (proof_bytes, cv) = prover.output_proof(
        &mut ctx,
        esk,
        payment_address,
        rcm,
        value,
    );
    
    // Compute note commitment (cmu) for the note
    use zcash_primitives::sapling::value::NoteValue;
    let rcm_bytes: [u8; 32] = {
        let mut arr = [0u8; 32];
        let fr_bytes = rcm.to_bytes();
        arr.copy_from_slice(&fr_bytes[..32]);
        arr
    };
    let note = Note::from_parts(payment_address, NoteValue::from_raw(value), Rseed::AfterZip212(rcm_bytes));
    let cmu = note.cmu();
    
    Ok(ProofResponse {
        proof: proof_bytes.to_vec(),
        cv: cv.to_bytes().to_vec(),
        rk: None,
        cmu: Some(cmu.to_bytes().to_vec()),
    })
}

fn bytes_to_fr(bytes: &[u8]) -> AnyhowResult<jubjub::Fr> {
    use jubjub::Fr;
    if bytes.len() != 32 {
        anyhow::bail!("Field element must be 32 bytes");
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(bytes);
    let fr_opt = Fr::from_bytes(&arr.into());
    if fr_opt.is_some().into() {
        Ok(fr_opt.unwrap())
    } else {
        anyhow::bail!("Invalid field element")
    }
}

fn bytes_to_scalar(bytes: &[u8]) -> AnyhowResult<bls12_381::Scalar> {
    use bls12_381::Scalar;
    if bytes.len() != 32 {
        anyhow::bail!("Scalar must be 32 bytes");
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(bytes);
    let scalar_opt = Scalar::from_bytes(&arr);
    if scalar_opt.is_some().into() {
        Ok(scalar_opt.unwrap())
    } else {
        anyhow::bail!("Invalid scalar")
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Paths to Sapling parameters
    // Try multiple possible locations
    let spend_params = std::env::var("SAPLING_SPEND_PARAMS")
        .unwrap_or_else(|_| {
            // Try multiple locations in order of preference
            let possible_paths = [
                "../miden-browser-wallet/public/params/sapling-spend.params",
                "../miden-browser-wallet/public/zcash-params/sapling-spend.params",
                "../public/params/sapling-spend.params",
                "../public/zcash-params/sapling-spend.params",
                "sapling-spend.params"
            ];
            for path in &possible_paths {
                if std::path::Path::new(path).exists() {
                    return path.to_string();
                }
            }
            // Default fallback
            "../miden-browser-wallet/public/params/sapling-spend.params".to_string()
        });
    let output_params = std::env::var("SAPLING_OUTPUT_PARAMS")
        .unwrap_or_else(|_| {
            // Try multiple locations in order of preference
            let possible_paths = [
                "../miden-browser-wallet/public/params/sapling-output.params",
                "../miden-browser-wallet/public/zcash-params/sapling-output.params",
                "../public/params/sapling-output.params",
                "../public/zcash-params/sapling-output.params",
                "sapling-output.params"
            ];
            for path in &possible_paths {
                if std::path::Path::new(path).exists() {
                    return path.to_string();
                }
            }
            // Default fallback
            "../miden-browser-wallet/public/params/sapling-output.params".to_string()
        });
    
    // Initialize the prover
    println!("Loading Sapling parameters...");
    println!("  Spend params: {}", spend_params);
    println!("  Output params: {}", output_params);
    
    // Check if parameter files exist
    if !std::path::Path::new(&spend_params).exists() {
        eprintln!("ERROR: Sapling spend params not found at: {}", spend_params);
        eprintln!("Please download from: https://download.z.cash/downloads/sapling-spend.params");
        std::process::exit(1);
    }
    if !std::path::Path::new(&output_params).exists() {
        eprintln!("ERROR: Sapling output params not found at: {}", output_params);
        eprintln!("Please download from: https://download.z.cash/downloads/sapling-output.params");
        std::process::exit(1);
    }
    
    let prover = LocalTxProver::new(
        std::path::Path::new(&spend_params),
        std::path::Path::new(&output_params),
    );
    
    let app_state = web::Data::new(AppState {
        prover: Arc::new(prover),
    });
    
    println!("Starting Zcash Proving Service on http://localhost:8081");
    println!("Ready to generate Sapling proofs");
    
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .route("/health", web::get().to(health))
            .route("/prove/spend", web::post().to(prove_spend))
            .route("/prove/output", web::post().to(prove_output))
    })
    .bind("127.0.0.1:8081")?
    .run()
    .await
}
