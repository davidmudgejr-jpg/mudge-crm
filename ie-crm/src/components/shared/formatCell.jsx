import React from 'react';
import { formatDatePacific, formatDateTimePacific } from '../../utils/timezone';

// Unified cell formatter — replaces 4 duplicate formatCell functions across pages

export default function formatCell(value, format) {
  if (value == null || value === '') return <span className="text-crm-muted">--</span>;

  switch (format) {
    case 'number':
      return Number(value).toLocaleString();

    case 'currency':
      return `$${Number(value).toLocaleString()}`;

    case 'percent':
      return `${value}%`;

    case 'date':
      return formatDatePacific(value) || String(value);

    case 'datetime':
      return formatDateTimePacific(value) || String(value);

    case 'bool':
      return value === true || value === 'true' ? (
        <span className="text-green-400">Yes</span>
      ) : (
        <span className="text-crm-muted">No</span>
      );

    case 'priority': {
      const colors = { Hot: 'bg-red-500/20 text-red-400', Warm: 'bg-orange-500/20 text-orange-400', Cold: 'bg-blue-500/20 text-blue-400', Dead: 'bg-gray-500/20 text-gray-400' };
      return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[value] || 'bg-crm-border text-crm-muted'}`}>{value}</span>;
    }

    case 'status': {
      const statusColors = {
        Active: 'bg-green-500/15 text-green-400 border-green-500/30',
        Closed: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
        Pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        'Under Contract': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        Lost: 'bg-red-500/15 text-red-400 border-red-500/30',
        Won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      };
      return (
        <span className={`text-xs px-1.5 py-0.5 rounded border ${statusColors[value] || 'bg-crm-card text-crm-muted border-crm-border'}`}>
          {value}
        </span>
      );
    }

    case 'type': {
      const typeColors = {
        Owner: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        Broker: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        Tenant: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
        Investor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        Lender: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
        Other: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
      };
      return (
        <span className={`text-xs px-1.5 py-0.5 rounded border ${typeColors[value] || 'bg-crm-card text-crm-muted border-crm-border'}`}>
          {value}
        </span>
      );
    }

    case 'level': {
      const lvl = { A: 'text-green-400', B: 'text-yellow-400', C: 'text-orange-400', D: 'text-red-400' };
      return <span className={`font-medium ${lvl[value] || ''}`}>{value}</span>;
    }

    case 'tags': {
      if (!value) return <span className="text-crm-muted">--</span>;
      const arr = Array.isArray(value) ? value : String(value).split(',').map((s) => s.trim()).filter(Boolean);
      if (!arr.length) return <span className="text-crm-muted">--</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {arr.map((tag, i) => (
            <span key={i} className="text-[10px] bg-crm-card border border-crm-border rounded px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </span>
      );
    }

    case 'url':
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-crm-accent hover:underline truncate">
          {value}
        </a>
      );

    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-crm-accent hover:underline">
          {value}
        </a>
      );

    case 'phone':
      return (
        <a href={`tel:${value}`} className="text-crm-accent hover:underline">
          {value}
        </a>
      );

    case 'checkbox':
      return value ? (
        <span className="text-crm-accent">✓</span>
      ) : (
        <span className="text-crm-muted">—</span>
      );

    case 'single_select':
      return (
        <span className="text-xs px-1.5 py-0.5 rounded bg-crm-card border border-crm-border">
          {value}
        </span>
      );

    default:
      return String(value);
  }
}
