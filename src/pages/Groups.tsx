import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useGroups, useCreateGroup } from '@/hooks/useGroups';
import { formatCents } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, ChevronRight, Archive } from 'lucide-react';

export default function Groups() {
  const { data: groups, isLoading } = useGroups();
  const createGroup = useCreateGroup();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('EUR');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const group = await createGroup.mutateAsync({ name: name.trim(), description: description.trim() || undefined, currency });
    setOpen(false);
    setName('');
    setDescription('');
    navigate(`/groups/${group.id}`);
  };

  const activeGroups = groups?.filter((g) => !g.is_archived) || [];
  const archivedGroups = groups?.filter((g) => g.is_archived) || [];

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Groups</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Group</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip to Berlin" required maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Summer 2025" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EUR" maxLength={3} />
                </div>
                <Button type="submit" className="w-full" disabled={createGroup.isPending}>
                  {createGroup.isPending ? 'Creating…' : 'Create Group'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : activeGroups.length === 0 && archivedGroups.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No groups yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Create one to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGroups.map((group) => (
              <Card
                key={group.id}
                className="flex cursor-pointer items-center gap-3 p-4 transition-shadow hover:shadow-md"
                onClick={() => navigate(`/groups/${group.id}`)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-display font-bold text-lg">
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{group.name}</p>
                  {group.description && (
                    <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{group.currency}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            ))}

            {archivedGroups.length > 0 && (
              <>
                <p className="flex items-center gap-1.5 pt-4 text-xs font-medium text-muted-foreground">
                  <Archive className="h-3 w-3" /> Archived
                </p>
                {archivedGroups.map((group) => (
                  <Card
                    key={group.id}
                    className="flex cursor-pointer items-center gap-3 p-4 opacity-60 transition-shadow hover:shadow-md"
                    onClick={() => navigate(`/groups/${group.id}`)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground font-display font-bold text-lg">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{group.name}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
