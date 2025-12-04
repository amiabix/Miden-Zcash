import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
        <p className="text-muted-foreground">
          The page you are looking for does not exist.
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild variant="default">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
