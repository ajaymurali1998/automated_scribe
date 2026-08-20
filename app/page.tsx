import Workspace from "@/components/Workspace";

// No login on this build — the app is protected at the Vercel deployment level
// (Project -> Settings -> Deployment Protection -> Password) instead of in-app auth.
export default function Home() {
  return <Workspace />;
}
