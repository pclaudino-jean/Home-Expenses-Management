import Layout from '@/components/Layout';
import { Card } from '@/components/ui/card';

export default function Activity() {
  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 pt-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Activity</h1>
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Recent activity from your groups will appear here.</p>
        </Card>
      </div>
    </Layout>
  );
}
