import { signIn } from "@/auth";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{ marginTop: 0, color: '#333' }}>Safe Haven Booking</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>Sign in to check room availability.</p>

        {error === 'AccessDenied' && (
          <div style={{ 
            color: '#721c24', 
            backgroundColor: '#f8d7da', 
            padding: '10px', 
            borderRadius: '4px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            Access Denied. Your email is not authorized to access this application.
          </div>
        )}

        <form
          action={async () => {
            "use server"
            await signIn("google")
          }}
        >
          <button type="submit" style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}>
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}