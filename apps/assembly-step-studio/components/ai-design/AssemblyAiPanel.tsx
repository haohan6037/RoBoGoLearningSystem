'use client';

import { useState } from 'react';
import {
  interpretLocalAssemblyRequest,
  type LocalAssemblyCommand,
} from '@/lib/ai-design/assemblyAiCommands';

export default function AssemblyAiPanel({
  catalogReady,
  partCount,
  onApplyRectangularChassis,
  onApplyGearDrivenClaw,
}: {
  catalogReady: boolean;
  partCount: number;
  onApplyRectangularChassis: () => void;
  onApplyGearDrivenClaw: () => void;
}) {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<LocalAssemblyCommand | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const previewRequest = () => {
    const result = interpretLocalAssemblyRequest(input);
    if (result.status === 'unsupported') {
      setPending(null);
      setMessage(result.message);
      return;
    }
    setPending(result.command);
    setMessage(null);
  };

  const applyPending = () => {
    if (!pending || !catalogReady) return;
    if (pending.type === 'replace-with-gear-driven-claw') {
      onApplyGearDrivenClaw();
    } else {
      onApplyRectangularChassis();
    }
    setPending(null);
    setInput('');
    setMessage('The design has been applied. If the result is not right, use Undo at the top to restore the previous assembly.');
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Assembly AI</p>
            <h2 className="mt-1 text-base font-bold text-slate-900">Modify the model with a prompt</h2>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">Local experiment</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          This currently uses a deterministic local command interpreter and is not connected to a cloud AI model.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Try a supported command</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setInput('Create a narrow rectangular chassis')}
              className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-left text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >Create a narrow rectangular chassis</button>
            <button
              type="button"
              onClick={() => setInput('Create a gear-driven claw that opens and closes')}
              className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-left text-xs font-semibold text-violet-700 hover:bg-violet-100"
            >Create a gear-driven Claw</button>
          </div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe how you want to modify the current Assembly..."
            rows={4}
            className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="button"
            disabled={!input.trim()}
            onClick={previewRequest}
            className="mt-2 w-full rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >Preview changes</button>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
            {message}
          </div>
        )}

        {pending && (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Proposed changes</p>
            <h3 className="mt-1 text-base font-bold text-slate-900">{pending.title}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{pending.summary}</p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              {pending.details.map((detail) => <li key={detail}>• {detail}</li>)}
            </ul>
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              {partCount > 0 && <p className="font-bold">The current canvas contains {partCount} parts.</p>}
              {pending.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >Cancel</button>
              <button
                type="button"
                disabled={!catalogReady}
                onClick={applyPending}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >{catalogReady ? 'Apply changes' : 'Loading part library'}</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
