'use client';
import { useState } from 'react';

export function useReorderSuggestions({ products, onApply }) {
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [reorderMeta, setReorderMeta] = useState(null);
  const [showReorderPanel, setShowReorderPanel] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  async function fetchReorderSuggestions() {
    try {
      const res = await fetch('/api/purchasing/reorder-suggestions');
      if (res.ok) {
        const data = await res.json();
        setReorderSuggestions(Array.isArray(data) ? data : (data.suggestions || []));
        setReorderMeta(Array.isArray(data) ? null : (data.meta || null));
      }
    } catch {
      // non-critical
    }
  }

  async function recalculateLowStock() {
    setRecalculating(true);
    try {
      const res = await fetch('/api/inventory/low-stock-cache', { method: 'POST' });
      if (res.ok) await fetchReorderSuggestions();
    } catch {
      // non-critical
    } finally {
      setRecalculating(false);
    }
  }

  function handleReorderItem(suggestion) {
    const product = products.find(p => p.id === suggestion.productId);
    onApply({
      supplierId:     suggestion.supplierId,
      supplierName:   suggestion.supplierName || '',
      paymentTerms:   suggestion.paymentTerms || '月結',
      warehouse:      suggestion.warehouse,
      productId:      suggestion.productId,
      productName:    suggestion.productName,
      product,
      suggestedQty:   suggestion.suggestedQty,
      lastUnitPrice:  suggestion.lastUnitPrice,
    });
    setShowReorderPanel(false);
  }

  return {
    reorderSuggestions,
    reorderMeta,
    showReorderPanel, setShowReorderPanel,
    fetchReorderSuggestions,
    recalculateLowStock,
    recalculating,
    handleReorderItem,
  };
}
