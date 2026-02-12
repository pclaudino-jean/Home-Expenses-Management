import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useGroup, useGroupMembers, useAddMember, useUpdateGroup } from '@/hooks/useGroups';
import { useExpenses, useSoftDeleteExpense } from '@/hooks/useExpenses';
import { usePayments, useSoftDeletePayment } from '@/hooks/usePayments';
import { useLabels, useCreateLabel, useDeleteLabel } from '@/hooks/useLabels';
import { useAuth } from '@/contexts/AuthContext';
import { calculateBalances, calculatePairwiseDebts } from '@/lib/balances';
import { formatCents } from '@/types/database';
import type { GroupMember, Expense, Payment } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Plus,
  Trash2,
  UserPlus,
  Download,
  Upload,
  Receipt,
  ArrowRightLeft,
  BarChart3,
  Users,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: group } = useGroup(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: expenses = [] } = useExpenses(groupId);
  const { data: payments = [] } = usePayments(groupId);
  const { data: labels = [] } = useLabels(groupId);
  const addMember = useAddMember();
  const updateGroup = useUpdateGroup();
  const softDeleteExpense = useSoftDeleteExpense();
  const softDeletePayment = useSoftDeletePayment();
  const createLabel = useCreateLabel();
  const deleteLabel = useDeleteLabel();

  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isAdmin = currentMember?.role_in_group === 'admin';

  if (!group) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const balances = calculateBalances(members, expenses, payments);
  const debts = calculatePairwiseDebts(members, expenses, payments);
  const isSettled = balances.every((b) => Math.abs(b.netBalance) <= 1);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addMember.mutateAsync({ groupId: groupId!, email: addMemberEmail.trim() });
      setAddMemberEmail('');
      setAddMemberOpen(false);
      toast.success('Member added!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Delete this expense?')) return;
    await softDeleteExpense.mutateAsync({ expenseId, groupId: groupId! });
    toast.success('Expense deleted');
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Delete this payment?')) return;
    await softDeletePayment.mutateAsync({ paymentId, groupId: groupId! });
    toast.success('Payment deleted');
  };

  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    await createLabel.mutateAsync({ groupId: groupId!, name: newLabelName.trim() });
    setNewLabelName('');
    toast.success('Label created');
  };

  const handleExportJSON = () => {
    const data = {
      group: { ...group },
      members: members.map(({ id, user_id, role_in_group, display_name, profiles }) => ({
        id, user_id, role_in_group, display_name, email: profiles?.email,
      })),
      labels,
      expenses: expenses.map((e) => ({
        ...e,
        expense_splits: e.expense_splits?.map((s) => ({
          id: s.id, member_id: s.member_id, percentage: s.percentage, amount_cents: s.amount_cents,
        })),
      })),
      payments,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localsplit-${group.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExpensesCSV = () => {
    const header = 'expense_id,date,description,amount_total,currency,paid_by_email,label,splits_json,created_at,created_by_email,updated_at,updated_by_email,deleted_at';
    const rows = expenses.map((e) => {
      const payerEmail = (e as any).paid_by_member?.profiles?.email || '';
      const labelName = e.labels?.name || '';
      const splits = JSON.stringify(e.expense_splits?.map((s) => ({
        member_id: s.member_id, percentage: s.percentage, amount_cents: s.amount_cents,
      })) || []);
      return [e.id, e.date, `"${e.description.replace(/"/g, '""')}"`, (e.amount_cents / 100).toFixed(2), e.currency, payerEmail, `"${labelName}"`, `"${splits.replace(/"/g, '""')}"`, e.created_at, '', e.updated_at, '', e.deleted_at || ''].join(',');
    });
    downloadCSV(`expenses-${group.name.replace(/\s+/g, '-')}.csv`, [header, ...rows].join('\n'));
  };

  const handleExportPaymentsCSV = () => {
    const header = 'payment_id,date,payer_email,payee_email,amount,currency,note,created_at,created_by_email,deleted_at';
    const rows = payments.map((p) => {
      const payerEmail = (p as any).payer?.profiles?.email || '';
      const payeeEmail = (p as any).payee?.profiles?.email || '';
      return [p.id, p.date, payerEmail, payeeEmail, (p.amount_cents / 100).toFixed(2), p.currency, `"${(p.note || '').replace(/"/g, '""')}"`, p.created_at, '', p.deleted_at || ''].join(',');
    });
    downloadCSV(`payments-${group.name.replace(/\s+/g, '-')}.csv`, [header, ...rows].join('\n'));
  };

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 pt-4">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/groups')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold text-foreground truncate">{group.name}</h1>
            {group.description && <p className="text-xs text-muted-foreground truncate">{group.description}</p>}
          </div>
          {isSettled && (
            <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-xs">
              Settled ✓
            </Badge>
          )}
        </div>

        <Tabs defaultValue="expenses" className="w-full">
          <TabsList className="w-full grid grid-cols-6 h-auto">
            <TabsTrigger value="expenses" className="text-xs px-1 py-2 flex flex-col gap-0.5">
              <Receipt className="h-3.5 w-3.5" /><span>Expenses</span>
            </TabsTrigger>
            <TabsTrigger value="balances" className="text-xs px-1 py-2 flex flex-col gap-0.5">
              <ArrowRightLeft className="h-3.5 w-3.5" /><span>Balances</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs px-1 py-2 flex flex-col gap-0.5">
              <Receipt className="h-3.5 w-3.5" /><span>Payments</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs px-1 py-2 flex flex-col gap-0.5">
              <BarChart3 className="h-3.5 w-3.5" /><span>Stats</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="text-xs px-1 py-2 flex flex-col gap-0.5">
              <Users className="h-3.5 w-3.5" /><span>Members</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="text-xs px-1 py-2 flex flex-col gap-0.5">
              <Download className="h-3.5 w-3.5" /><span>Export</span>
            </TabsTrigger>
          </TabsList>

          {/* EXPENSES TAB */}
          <TabsContent value="expenses" className="mt-4 space-y-3">
            <Button size="sm" className="w-full gap-1" onClick={() => navigate(`/groups/${groupId}/add-expense`)}>
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
            {expenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No expenses yet.</p>
            ) : (
              expenses.map((exp) => {
                const payerName = (exp as any).paid_by_member?.display_name || (exp as any).paid_by_member?.profiles?.username || '?';
                const myShare = exp.expense_splits?.find((s) => s.member_id === currentMember?.id)?.amount_cents || 0;
                return (
                  <Card key={exp.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground truncate">{exp.description}</p>
                          {exp.labels && (
                            <Badge variant="outline" className="text-[10px] shrink-0">{exp.labels.name}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {payerName} paid · {exp.date}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{formatCents(exp.amount_cents, exp.currency)}</p>
                        {currentMember && (
                          <p className={`text-xs ${myShare > 0 ? 'text-owes' : 'text-muted-foreground'}`}>
                            your share: {formatCents(myShare, exp.currency)}
                          </p>
                        )}
                      </div>
                      {(isAdmin || exp.created_by === user?.id) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteExpense(exp.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* BALANCES TAB */}
          <TabsContent value="balances" className="mt-4 space-y-4">
            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold text-foreground">Net Balances</h3>
              {balances.map((b) => (
                <Card key={b.memberId} className="flex items-center justify-between p-3">
                  <span className="text-sm font-medium text-foreground">{b.memberName}</span>
                  <span className={`text-sm font-semibold ${b.netBalance > 1 ? 'text-receives' : b.netBalance < -1 ? 'text-owes' : 'text-muted-foreground'}`}>
                    {b.netBalance > 1 ? '+' : ''}{formatCents(b.netBalance, group.currency)}
                  </span>
                </Card>
              ))}
            </div>

            {debts.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-foreground">Who Owes Who</h3>
                {debts.map((d, i) => (
                  <Card key={i} className="flex items-center justify-between p-3">
                    <span className="text-sm text-foreground">
                      <span className="font-medium">{d.fromMemberName}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{d.toMemberName}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-owes">{formatCents(d.amountCents, group.currency)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => navigate(`/groups/${groupId}/add-payment?from=${d.fromMemberId}&to=${d.toMemberId}&amount=${d.amountCents}`)}
                      >
                        Settle
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PAYMENTS TAB */}
          <TabsContent value="payments" className="mt-4 space-y-3">
            <Button size="sm" className="w-full gap-1" onClick={() => navigate(`/groups/${groupId}/add-payment`)}>
              <Plus className="h-4 w-4" /> Record Payment
            </Button>
            {payments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              payments.map((pay) => {
                const payerName = (pay as any).payer?.display_name || (pay as any).payer?.profiles?.username || '?';
                const payeeName = (pay as any).payee?.display_name || (pay as any).payee?.profiles?.username || '?';
                return (
                  <Card key={pay.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {payerName} → {payeeName}
                        </p>
                        <p className="text-xs text-muted-foreground">{pay.date}{pay.note ? ` · ${pay.note}` : ''}</p>
                      </div>
                      <span className="font-semibold text-sm text-primary">{formatCents(pay.amount_cents, pay.currency)}</span>
                      {(isAdmin || pay.created_by === user?.id) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeletePayment(pay.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* STATS TAB */}
          <TabsContent value="stats" className="mt-4 space-y-4">
            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold">Per Member</h3>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-left text-muted-foreground font-medium">Member</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Paid</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Share</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.memberId} className="border-b border-border last:border-0">
                        <td className="p-2 font-medium">{b.memberName}</td>
                        <td className="p-2 text-right">{formatCents(b.totalPaid, group.currency)}</td>
                        <td className="p-2 text-right">{formatCents(b.totalShare, group.currency)}</td>
                        <td className={`p-2 text-right font-semibold ${b.netBalance > 1 ? 'text-receives' : b.netBalance < -1 ? 'text-owes' : ''}`}>
                          {b.netBalance > 1 ? '+' : ''}{formatCents(b.netBalance, group.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            {labels.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold">By Label</h3>
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-2 text-left text-muted-foreground font-medium">Label</th>
                        <th className="p-2 text-right text-muted-foreground font-medium">Total</th>
                        <th className="p-2 text-right text-muted-foreground font-medium"># Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labels.map((label) => {
                        const labelExpenses = expenses.filter((e) => e.label_id === label.id);
                        const total = labelExpenses.reduce((s, e) => s + e.amount_cents, 0);
                        return (
                          <tr key={label.id} className="border-b border-border last:border-0">
                            <td className="p-2 font-medium">{label.name}</td>
                            <td className="p-2 text-right">{formatCents(total, group.currency)}</td>
                            <td className="p-2 text-right">{labelExpenses.length}</td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const unlabeled = expenses.filter((e) => !e.label_id);
                        if (unlabeled.length === 0) return null;
                        const total = unlabeled.reduce((s, e) => s + e.amount_cents, 0);
                        return (
                          <tr className="border-b border-border last:border-0 text-muted-foreground">
                            <td className="p-2 italic">No label</td>
                            <td className="p-2 text-right">{formatCents(total, group.currency)}</td>
                            <td className="p-2 text-right">{unlabeled.length}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold">Monthly Spending</h3>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-left text-muted-foreground font-medium">Month</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Total</th>
                      <th className="p-2 text-right text-muted-foreground font-medium"># Expenses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const byMonth = new Map<string, { total: number; count: number }>();
                      for (const e of expenses) {
                        const month = e.date.slice(0, 7);
                        const cur = byMonth.get(month) || { total: 0, count: 0 };
                        cur.total += e.amount_cents;
                        cur.count += 1;
                        byMonth.set(month, cur);
                      }
                      return Array.from(byMonth.entries())
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([month, { total, count }]) => (
                          <tr key={month} className="border-b border-border last:border-0">
                            <td className="p-2 font-medium">{month}</td>
                            <td className="p-2 text-right">{formatCents(total, group.currency)}</td>
                            <td className="p-2 text-right">{count}</td>
                          </tr>
                        ));
                    })()}
                  </tbody>
                </table>
              </Card>
            </div>
          </TabsContent>

          {/* MEMBERS TAB */}
          <TabsContent value="members" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold">Members ({members.length})</h3>
                {isAdmin && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAddMemberOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
              {members.map((m) => (
                <Card key={m.id} className="flex items-center gap-3 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {(m.display_name || m.profiles?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.display_name || m.profiles?.username || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                  </div>
                  <Badge variant={m.role_in_group === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                    {m.role_in_group}
                  </Badge>
                </Card>
              ))}
            </div>

            {/* Labels */}
            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold">Labels</h3>
              <div className="flex flex-wrap gap-2">
                {labels.map((l) => (
                  <Badge key={l.id} variant="outline" className="gap-1">
                    {l.name}
                    {isAdmin && (
                      <button onClick={() => deleteLabel.mutateAsync({ labelId: l.id, groupId: groupId! })} className="ml-1 text-muted-foreground hover:text-destructive">
                        ×
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              {isAdmin && (
                <form onSubmit={handleCreateLabel} className="flex gap-2">
                  <Input value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} placeholder="New label" className="flex-1" maxLength={50} />
                  <Button type="submit" size="sm" variant="outline">Add</Button>
                </form>
              )}
            </div>

            {/* Group Settings */}
            {isAdmin && (
              <div className="space-y-3">
                <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5" /> Settings
                </h3>
                <Card className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Members can edit any expense</Label>
                    <Switch
                      checked={group.members_can_edit_any_expense}
                      onCheckedChange={(checked) => updateGroup.mutateAsync({ id: group.id, members_can_edit_any_expense: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Members can delete any expense</Label>
                    <Switch
                      checked={group.members_can_delete_any_expense}
                      onCheckedChange={(checked) => updateGroup.mutateAsync({ id: group.id, members_can_delete_any_expense: checked })}
                    />
                  </div>
                  <div className="pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => updateGroup.mutateAsync({ id: group.id, is_archived: !group.is_archived })}
                    >
                      {group.is_archived ? 'Unarchive Group' : 'Archive Group'}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Add Member Dialog */}
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Member by Email</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddMember} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={addMemberEmail}
                    onChange={(e) => setAddMemberEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={addMember.isPending}>
                    {addMember.isPending ? 'Adding…' : 'Add Member'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* EXPORT TAB */}
          <TabsContent value="export" className="mt-4 space-y-3">
            <h3 className="font-display text-sm font-semibold">Export</h3>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={handleExportJSON}>
                <Download className="h-4 w-4" /> Export JSON (full backup)
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={handleExportExpensesCSV}>
                <Download className="h-4 w-4" /> Export Expenses CSV
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={handleExportPaymentsCSV}>
                <Download className="h-4 w-4" /> Export Payments CSV
              </Button>
            </div>

            <h3 className="font-display text-sm font-semibold pt-4">Import</h3>
            <ImportJSON groupId={groupId!} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function ImportJSON({ groupId }: { groupId: string }) {
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Basic validation
      if (!data.group || !data.expenses) {
        toast.error('Invalid JSON format');
        return;
      }
      toast.info('Import functionality requires server-side processing. JSON parsed successfully - ' + data.expenses.length + ' expenses found.');
    } catch {
      toast.error('Failed to parse JSON file');
    }
  };

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
        <Upload className="h-5 w-5" />
        <span>Upload JSON file to import</span>
        <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
      </label>
    </div>
  );
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
