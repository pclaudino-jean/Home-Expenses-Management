import { Expense, ExpenseSplit, Payment, MemberBalance, PairwiseDebt, GroupMember } from '@/types/database';

export function calculateBalances(
  members: GroupMember[],
  expenses: Expense[],
  payments: Payment[]
): MemberBalance[] {
  const balanceMap = new Map<string, { paid: number; share: number }>();

  for (const m of members) {
    balanceMap.set(m.id, { paid: 0, share: 0 });
  }

  // Process active expenses
  for (const exp of expenses) {
    if (exp.deleted_at) continue;
    const payerBalance = balanceMap.get(exp.paid_by_member_id);
    if (payerBalance) {
      payerBalance.paid += exp.amount_cents;
    }
    if (exp.expense_splits) {
      for (const split of exp.expense_splits) {
        const memberBalance = balanceMap.get(split.member_id);
        if (memberBalance) {
          memberBalance.share += split.amount_cents;
        }
      }
    }
  }

  // Process active payments
  for (const pay of payments) {
    if (pay.deleted_at) continue;
    const payerBalance = balanceMap.get(pay.payer_member_id);
    const payeeBalance = balanceMap.get(pay.payee_member_id);
    if (payerBalance) payerBalance.paid += pay.amount_cents;
    if (payeeBalance) payeeBalance.share += pay.amount_cents;
  }

  return members.map((m) => {
    const b = balanceMap.get(m.id) || { paid: 0, share: 0 };
    return {
      memberId: m.id,
      memberName: m.display_name || m.profiles?.username || 'Unknown',
      totalPaid: b.paid,
      totalShare: b.share,
      netBalance: b.paid - b.share,
    };
  });
}

export function calculatePairwiseDebts(
  members: GroupMember[],
  expenses: Expense[],
  payments: Payment[]
): PairwiseDebt[] {
  // Track pairwise: debtMap[debtor][creditor] = amount in cents
  const debtMap = new Map<string, Map<string, number>>();
  const memberNames = new Map<string, string>();

  for (const m of members) {
    debtMap.set(m.id, new Map());
    memberNames.set(m.id, m.display_name || m.profiles?.username || 'Unknown');
  }

  for (const exp of expenses) {
    if (exp.deleted_at) continue;
    const payerId = exp.paid_by_member_id;
    if (exp.expense_splits) {
      for (const split of exp.expense_splits) {
        if (split.member_id !== payerId && split.amount_cents > 0) {
          const current = debtMap.get(split.member_id)?.get(payerId) || 0;
          debtMap.get(split.member_id)?.set(payerId, current + split.amount_cents);
        }
      }
    }
  }

  // Reduce debts with payments
  for (const pay of payments) {
    if (pay.deleted_at) continue;
    const current = debtMap.get(pay.payer_member_id)?.get(pay.payee_member_id) || 0;
    debtMap.get(pay.payer_member_id)?.set(pay.payee_member_id, current - pay.amount_cents);
  }

  // Net out pairwise
  const debts: PairwiseDebt[] = [];
  const processed = new Set<string>();

  for (const [a, aDebts] of debtMap) {
    for (const [b, aOwesB] of aDebts) {
      const key = [a, b].sort().join('-');
      if (processed.has(key)) continue;
      processed.add(key);

      const bOwesA = debtMap.get(b)?.get(a) || 0;
      const net = aOwesB - bOwesA;

      if (Math.abs(net) > 1) { // > 1 cent
        if (net > 0) {
          debts.push({
            fromMemberId: a,
            fromMemberName: memberNames.get(a) || 'Unknown',
            toMemberId: b,
            toMemberName: memberNames.get(b) || 'Unknown',
            amountCents: net,
          });
        } else {
          debts.push({
            fromMemberId: b,
            fromMemberName: memberNames.get(b) || 'Unknown',
            toMemberId: a,
            toMemberName: memberNames.get(a) || 'Unknown',
            amountCents: -net,
          });
        }
      }
    }
  }

  return debts.sort((a, b) => b.amountCents - a.amountCents);
}

export function computeSplitAmounts(
  totalCents: number,
  splits: { memberId: string; percentage: number }[]
): { memberId: string; percentage: number; amountCents: number }[] {
  if (splits.length === 0) return [];

  let remaining = totalCents;
  const results = splits.map((s) => {
    const raw = (totalCents * s.percentage) / 100;
    const rounded = Math.floor(raw);
    return { ...s, amountCents: rounded, rawAmount: raw };
  });

  const allocated = results.reduce((sum, r) => sum + r.amountCents, 0);
  remaining = totalCents - allocated;

  // Distribute remainder to member with largest fractional part
  if (remaining > 0) {
    const sorted = [...results].sort(
      (a, b) => (b.rawAmount - Math.floor(b.rawAmount)) - (a.rawAmount - Math.floor(a.rawAmount))
    );
    for (let i = 0; i < remaining && i < sorted.length; i++) {
      const target = results.find((r) => r.memberId === sorted[i].memberId);
      if (target) target.amountCents += 1;
    }
  }

  return results.map(({ memberId, percentage, amountCents }) => ({
    memberId,
    percentage,
    amountCents,
  }));
}
