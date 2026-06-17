import { useGitHubStore } from "@/stores/githubStore";
import { Button } from "@/components/ui/button";
import { LogOut, Github } from "lucide-react";
import { useState, useEffect } from "react";

export function GitHubAuth() {
  const { authenticated, user, startDeviceAuth, signOut, error, clearVerification } = useGitHubStore();
  const [authing, setAuthing] = useState(false);
  const [verification, setVerification] = useState<{ code: string; uri: string } | null>(null);

  useEffect(() => {
    const unsub = useGitHubStore.subscribe((state: any) => {
      if (state._verification) {
        setVerification({ code: state._verification.code, uri: state._verification.uri });
        clearVerification();
      }
    });
    return unsub;
  }, [clearVerification]);

  if (authenticated && user) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <img
          src={user.avatarUrl}
          alt={user.login}
          className="h-6 w-6 rounded-full"
        />
        <span className="text-xs text-muted-foreground flex-1 truncate">{user.login}</span>
        <Button variant="ghost" size="icon-xs" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (verification) {
    return (
      <div className="px-3 py-4 space-y-3 border-b">
        <p className="text-xs text-muted-foreground">
          Enter the code below at{" "}
          <a
            href={verification.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            github.com/login/device
          </a>
        </p>
        <code className="block text-center text-lg font-mono bg-muted rounded px-4 py-2 tracking-widest">
          {verification.code}
        </code>
        <p className="text-xs text-muted-foreground text-center">Waiting for authorization...</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="px-3 py-4 border-b">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        disabled={authing}
        onClick={async () => {
          setAuthing(true);
          setVerification(null);
          await startDeviceAuth();
          setAuthing(false);
        }}
      >
        <Github className="h-4 w-4" />
        {authing ? "Connecting..." : "Sign in with GitHub"}
      </Button>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
