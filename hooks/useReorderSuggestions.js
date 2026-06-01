'use client';
import { useState } from 'react';

export function useReorderSuggestions({ products, onApply }) {
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [showReorderPanel, setShowReorderPanel] = useState(false);

  async function fetchReorderSuggestions() {
    try {
      const res = await fetch('/api/purchasing/reorder-suggestions');
      if (res.ok) setReorderSuggestions(await res.json());
    } catch {
      // non-critical
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
    showReorderPanel, setShowReorderPanel,
    fetchReorderSuggestions,
    handleReorderItem,
  };
}
