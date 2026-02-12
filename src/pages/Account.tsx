import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LogOut, User } from 'lucide-react';

export default function Account() {
  const { profile, user, signOut } = useAuth();

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 pt-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Account</h1>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-7 w-7" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-foreground">{profile?.username || 'User'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <Button variant="outline" className="w-full gap-2 text-destructive" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">LocalSplit v1.0</p>
          <p className="text-xs text-muted-foreground">Self-hosted expense splitting</p>
        </div>
      </div>
    </Layout>
  );
}
