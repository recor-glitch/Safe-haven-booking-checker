import { signIn } from "@/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4 font-sans">
      <Card className="w-full max-w-md shadow-lg border-muted/50">
        <CardHeader className="text-center pb-6">
          <CardTitle className="text-2xl font-bold tracking-tight">Safe Haven Booking</CardTitle>
          <CardDescription className="text-sm mt-2">
            Sign in to check room availability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error === 'AccessDenied' && (
            <Alert variant="destructive" className="mb-6">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Access Denied</AlertTitle>
              <AlertDescription>
                Your email is not authorized to access this application. Please contact an administrator.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4">
            <form
              action={async () => {
                "use server"
                await signIn("google")
              }}
            >
              <Button type="submit" className="w-full h-11 text-base font-semibold" variant="default">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                </svg>
                Sign in with Google
              </Button>
            </form>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center text-xs text-muted-foreground border-t bg-muted/20 py-4">
          Strictly authorized access only.
        </CardFooter>
      </Card>
    </div>
  );
}