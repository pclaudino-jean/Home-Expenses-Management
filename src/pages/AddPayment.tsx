import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useGroup, useGroupMembers } from '@/hooks/useGroups';
import { useCreatePayment } from '@/hooks/usePayments';
import { useAuth } from '@/contexts/AuthContext';
import { parseCentsFromInput } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function AddPayment() {
  const { groupId } = useParams<{ groupId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: group } = useGroup(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const createPayment = useCreatePayment();

  const [payer, setPayer] = useState(searchParams.get('from') || '');
  const [payee, setPayee] = useState(searchParams.get('to') || '');
  const [amount, setAmount] = useState(() => {
    const cents = searchParams.get('amount');
    return cents ? (parseInt(cents) / 100).toFixed(2) : '';
  });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payer || !payee || !amount) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (payer === payee) {
      toast.error('Payer and payee must be different');
      return;
    }

    const amountCents = parseCentsFromInput(amount);
    if (amountCents <= 0) {
      toast.error('Amount must be positive');
      return;
    }

    try {
      await createPayment.mutateAsync({
        groupId: groupId!,
        payerMemberId: payer,
        payeeMemberId: payee,
        amountCents,
        currency: group?.currency || 'EUR',
        date,
        note: note.trim() || undefined,
      });
      toast.success('Payment recorded!');
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
          <h1 className="font-display text-xl font-bold">Record Payment</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Who paid?</Label>
            <Select value={payer} onValueChange={setPayer}>
              <SelectTrigger>
                <SelectValue placeholder="Select payer" />
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

          <div className="space-y-2">
            <Label>Paid to?</Label>
            <Select value={payee} onValueChange={setPayee}>
              <SelectTrigger>
                <SelectValue placeholder="Select payee" />
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
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank transfer, cash, etc." maxLength={200} rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={createPayment.isPending}>
            {createPayment.isPending ? 'Saving…' : 'Record Payment'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
