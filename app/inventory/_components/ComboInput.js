'use client';

import { useState, useEffect, useRef } from 'react';

export default function ComboInput({ value, onChange, options, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()));

  return (
    <div ref={ref} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-md max-h-48 overflow-y-auto text-sm">
          {filtered.length > 0 ? filtered.map(o => (
            <li
              key={o}
              onMouseDown={() => { onChange(o); setOpen(false); }}
              className={`px-3 py-2 cursor-pointer hover:bg-amber-50 hover:text-amber-800 ${value === o ? 'bg-amber-50 text-amber-800 font-medium' : 'text-gray-700'}`}
            >
              {o}
            </li>
          )) : (
            <li className="px-3 py-2 text-gray-400">無符合選項，可直接輸入</li>
          )}
        </ul>
      )}
    </div>
  );
}
