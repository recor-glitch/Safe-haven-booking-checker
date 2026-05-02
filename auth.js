import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub,
    Google
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Get allowed emails from environment variable
      const allowedEmailsStr = process.env.ALLOWED_EMAILS || "";
      const allowedEmails = allowedEmailsStr.split(",").map(email => email.trim().toLowerCase());

      // Check if user's email is in the allowed list
      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        return true;
      }
      
      // Return false to deny access
      return false;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login", // Error code passed in query string as ?error=
  },
  session: {
    strategy: "jwt",
  },
});