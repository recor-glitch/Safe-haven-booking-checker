import "./globals.css";

export const metadata = {
  title: "Room Availability — SAFE HAVEN HOMESTAY",
  description: "Booking availability dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-muted/40">
        {children}
      </body>
    </html>
  );
}