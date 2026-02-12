import React, { useState, useEffect } from 'react';
import type { GroupMember } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface SplitEntry {
  memberId: string;
  memberName: string;
  included: boolean;
  percentage: number;
}

interface SplitEditorProps {
  members: GroupMember[];
  value: { memberId: string; percentage: number }[];
  onChange: (splits: { memberId: string; percentage: number }[]) => void;
}

export default function SplitEditor({ members, value, onChange }: SplitEditorProps) {
  const [entries, setEntries] = useState<SplitEntry[]>([]);

  useEffect(() => {
    if (value.length > 0) {
      setEntries(
        members.map((m) => {
          const existing = value.find((v) => v.memberId === m.id);
          return {
            memberId: m.id,
            memberName: m.display_name || m.profiles?.username || 'Unknown',
            included: !!existing,
            percentage: existing?.percentage ?? 0,
          };
        })
      );
    } else {
      const equalPct = members.length > 0 ? Math.round((10000 / members.length)) / 100 : 0;
      setEntries(
        members.map((m) => ({
          memberId: m.id,
          memberName: m.display_name || m.profiles?.username || 'Unknown',
          included: true,
          percentage: equalPct,
        }))
      );
    }
  }, [members]);

  const totalPct = entries.filter((e) => e.included).reduce((s, e) => s + e.percentage, 0);
  const isValid = Math.abs(totalPct - 100) <= 0.01;

  const updateEntry = (memberId: string, updates: Partial<SplitEntry>) => {
    const next = entries.map((e) =>
      e.memberId === memberId ? { ...e, ...updates } : e
    );
    setEntries(next);
    onChange(
      next
        .filter((e) => e.included && e.percentage > 0)
        .map((e) => ({ memberId: e.memberId, percentage: e.percentage }))
    );
  };

  const splitEvenly = () => {
    const included = entries.filter((e) => e.included);
    if (included.length === 0) return;
    const pct = Math.round((10000 / included.length)) / 100;
    const next = entries.map((e) => ({
      ...e,
      percentage: e.included ? pct : 0,
    }));
    setEntries(next);
    onChange(
      next
        .filter((e) => e.included && e.percentage > 0)
        .map((e) => ({ memberId: e.memberId, percentage: e.percentage }))
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Split by percentage</span>
        <Button type="button" variant="ghost" size="sm" onClick={splitEvenly} className="text-xs text-primary">
          Split evenly
        </Button>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.memberId} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
            <Checkbox
              checked={entry.included}
              onCheckedChange={(checked) =>
                updateEntry(entry.memberId, { included: !!checked, percentage: checked ? entry.percentage : 0 })
              }
            />
            <span className="flex-1 text-sm text-foreground truncate">{entry.memberName}</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={entry.percentage}
                onChange={(e) => updateEntry(entry.memberId, { percentage: parseFloat(e.target.value) || 0 })}
                className="w-20 text-right text-sm"
                disabled={!entry.included}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`text-right text-sm font-medium ${isValid ? 'text-primary' : 'text-destructive'}`}>
        Total: {totalPct.toFixed(2)}%{' '}
        {!isValid && <span className="text-xs">(must equal 100%)</span>}
      </div>
    </div>
  );
}
