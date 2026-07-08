import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, X, ChevronsUpDown } from "lucide-react";
import { useMasterProducts, useQuoteItems, useSaveQuote, type Quote, type QuoteItem } from "@/hooks/useCustomers";
import { differenceInMonths, parseISO } from "date-fns";

function inr(n: number) { return `₹ ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

function calcTerm(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  try {
    const m = differenceInMonths(parseISO(end), parseISO(start));
    return m >= 0 ? m : null;
  } catch { return null; }
}
function calcTotal(qty: number, unit: number, disc: number) {
  return Math.max(0, Number(qty) || 0) * Math.max(0, Number(unit) || 0) * (1 - Math.min(100, Math.max(0, Number(disc) || 0)) / 100);
}

const emptyRow = (i: number): QuoteItem => ({
  product_id: null, product_name: null, qty: 1, unit_price: 0,
  start_date: null, end_date: null, term_months: null, discount_pct: 0, total: 0, sort_order: i,
});

export function QuoteForm({
  opportunityId, quote, onClose,
}: { opportunityId: string; quote?: Quote | null; onClose: () => void; }) {
  const { data: products = [] } = useMasterProducts();
  const { data: existingItems } = useQuoteItems(quote?.id);
  const save = useSaveQuote();
  const [name, setName] = useState(quote?.name || "");
  const [notes, setNotes] = useState(quote?.notes || "");
  const [rows, setRows] = useState<QuoteItem[]>([emptyRow(0)]);

  useEffect(() => {
    if (quote && existingItems && existingItems.length) setRows(existingItems);
  }, [quote?.id, existingItems]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + calcTotal(r.qty, r.unit_price, r.discount_pct), 0), [rows]);

  const update = (i: number, patch: Partial<QuoteItem>) => {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[i], ...patch };
      merged.term_months = calcTerm(merged.start_date, merged.end_date);
      merged.total = calcTotal(merged.qty, merged.unit_price, merged.discount_pct);
      next[i] = merged;
      return next;
    });
  };

  const pickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    update(i, { product_id: p.id, product_name: p.product_name, unit_price: Number(p.default_unit_price) || 0 });
  };

  const submit = async () => {
    if (!name.trim()) return;
    const items = rows.filter((r) => r.product_id || (r.product_name && r.product_name.trim()));
    await save.mutateAsync({
      id: quote?.id,
      opportunity_id: opportunityId,
      name: name.trim(),
      notes: notes.trim() || null,
      total: grandTotal,
      items: items.map((r, i) => ({ ...r, sort_order: i, total: calcTotal(r.qty, r.unit_price, r.discount_pct) })),
    });
    onClose();
  };

  return (
    <Card>
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-3">
            <Label>Quote Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Initial Quote" />
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Product</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-28">Unit Price</TableHead>
                <TableHead className="w-36">Start Date</TableHead>
                <TableHead className="w-36">End Date</TableHead>
                <TableHead className="w-20">Term</TableHead>
                <TableHead className="w-20">Disc %</TableHead>
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <ProductPicker
                      products={products}
                      value={r.product_id}
                      label={r.product_name}
                      onChange={(id) => pickProduct(i, id)}
                    />
                  </TableCell>
                  <TableCell><Input type="number" min={0} value={r.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={r.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input type="date" value={r.start_date || ""} onChange={(e) => update(i, { start_date: e.target.value || null })} /></TableCell>
                  <TableCell><Input type="date" value={r.end_date || ""} onChange={(e) => update(i, { end_date: e.target.value || null })} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.term_months != null ? `${r.term_months}mo` : "—"}</TableCell>
                  <TableCell><Input type="number" min={0} max={100} value={r.discount_pct} onChange={(e) => update(i, { discount_pct: Number(e.target.value) })} /></TableCell>
                  <TableCell className="text-right font-medium">{inr(r.total)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow(prev.length)])}>
            <Plus className="h-4 w-4 mr-1" />Add Line
          </Button>
          <div className="text-sm">
            <span className="text-muted-foreground">Quote Total:</span>{" "}
            <span className="font-semibold text-base">{inr(grandTotal)}</span>
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || save.isPending}>Save Quote</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductPicker({
  products, value, label, onChange,
}: {
  products: { id: string; product_name: string; default_unit_price: number }[];
  value: string | null; label: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = label || products.find((p) => p.id === value)?.product_name || "Select product";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{display}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]" align="start">
        <Command>
          <CommandInput placeholder="Search product..." />
          <CommandList>
            <CommandEmpty>No products.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem key={p.id} value={p.product_name} onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <div className="flex justify-between w-full">
                    <span>{p.product_name}</span>
                    <span className="text-xs text-muted-foreground">₹{Number(p.default_unit_price || 0).toLocaleString()}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
