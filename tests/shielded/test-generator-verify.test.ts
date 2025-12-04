import { JubjubPoint } from '/Users/abix/Desktop/Miden-Zcash/src/shielded/jubjubHelper';

describe('Jubjub Generator Point', () => {
  it('should be on the curve', () => {
    // Known Jubjub generator point
    const Gu = 8967009104981691511184280257777137469511400633666422603073258241851469509970n;
    const Gv = 15931800829954170746055714094219556811473228541646137357846426087758294707819n;

    const G = new JubjubPoint(Gu, Gv);

    console.log('Generator point on curve:', G.isOnCurve());
    console.log('Generator x:', G.x.value.toString(16).slice(0, 20));
    console.log('Generator y:', G.y.value.toString(16).slice(0, 20));

    expect(G.isOnCurve()).toBe(true);
  });
});
