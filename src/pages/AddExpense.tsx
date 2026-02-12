import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useGroup, useGroupMembers } from '@/hooks/useGroups';
import { useLabels } from '@/hooks/useLabels';
import { useCreateExpense } from '@/hooks/useExpenses';
import { useAuth } from '@/contexts/AuthContext';
import { parseCentsFromInput } from '@/types/database';
import SplitEditor from '@/components/SplitEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function AddExpense() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: group } = useGroup(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: labels = [] } = useLabels(groupId);
  const createExpense = useCreateExpense();

  const currentMember = members.find((m) => m.user_id === user?.id);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState('');
  const [labelId, setLabelId] = useState<string>('');
  const [splits, setSplits] = useState<{ memberId: string; percentage: number }[]>([]);

  // Auto-select current member as payer
  React.useEffect(() => {
    if (currentMember && !paidBy) {
      setPaidBy(currentMember.id);
    }
  }, [currentMember]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || !paidBy || splits.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    const totalPct = splits.reduce((s, sp) => s + sp.percentage, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      toast.error('Split percentages must total 100%');
      return;
    }

    const amountCents = parseCentsFromInput(amount);
    if (amountCents <= 0) {
      toast.error('Amount must be positive');
      return;
    }

    try {
      await createExpense.mutateAsync({
        groupId: groupId!,
        description: description.trim(),
        amountCents,
        currency: group?.currency || 'EUR',
        date,
        paidByMemberId: paidBy,
        labelId: labelId || null,
        splits,
      });
      toast.success('Expense added!');
      navigate(`/groups/${groupId}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!group) return <Layout><div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div></Layout>;

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 pt-4">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${groupId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-xl font-bold">Add Expense</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner, groceries, etc." required maxLength={200} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount ({group.currency})</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Paid by</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger>
                <SelectValue placeholder="Select who paid" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name || m.profiles?.username || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {labels.length > 0 && (
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Select value={labelId} onValueChange={setLabelId}>
                <SelectTrigger>
                  <SelectValue placeholder="No label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No label</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <SplitEditor members={members} value={splits} onChange={setSplits} />

          <Button type="submit" className="w-full" disabled={createExpense.isPending}>
            {createExpense.isPending ? 'Saving…' : 'Save Expense'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
