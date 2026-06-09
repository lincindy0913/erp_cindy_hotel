'use client';

import { useState, useEffect } from 'react';

export function useAssetDetail({ year }) {
  const [selected, setSelected] = useState(null);
  const [detailIncomes, setDetailIncomes] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTaxes, setDetailTaxes] = useState([]);
  const [disposals, setDisposals] = useState([]);

  // ESC closes detail panel
  useEffect(() => {
    if (!selected) return;
    const handler = e => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  // Load detail incomes when a property is selected
  useEffect(() => {
    if (!selected) { setDetailIncomes([]); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/rentals/income?propertyId=${selected.id}&year=${year}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDetailIncomes(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDetailIncomes([]); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected, year]);

  // Load taxes for the selected property
  useEffect(() => {
    if (!selected) { setDetailTaxes([]); return; }
    let cancelled = false;
    fetch(`/api/rentals/taxes?taxYear=${year}&propertyId=${selected.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setDetailTaxes(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDetailTaxes([]); });
    return () => { cancelled = true; };
  }, [selected, year]);

  // Load disposals when selected asset changes
  useEffect(() => {
    const assetId = selected?.asset?.id;
    if (!assetId) { setDisposals([]); return; }
    let cancelled = false;
    fetch(`/api/assets/${assetId}/disposals`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setDisposals(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDisposals([]); });
    return () => { cancelled = true; };
  }, [selected?.asset?.id]);

  return {
    selected, setSelected,
    detailIncomes,
    detailLoading,
    detailTaxes,
    disposals, setDisposals,
  };
}
