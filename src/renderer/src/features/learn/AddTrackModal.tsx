import { Plus } from 'lucide-react';
import { useState } from 'react';
import { START_LEVEL_OPTIONS, TRACK_COLORS, TRACK_PRESETS } from '@shared/constants';
import { Modal } from '../../components/Modal';
import { Button, Input, Label, Segmented, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/format';
import { attempt, useApp } from '../../lib/store';

const EMOJIS = ['📘', '🧠', '⚙️', '🧪', '🛠️', '📊', '🔐', '☁️', '🐳', '⚛️', '🐍', '🦀', '🧩', '🗺️', '💬', '🚀'];

export function AddTrackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const snapshot = useApp((s) => s.snapshot);
  const [preset, setPreset] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [emoji, setEmoji] = useState('📘');
  const [proficiency, setProficiency] = useState(1);
  const [busy, setBusy] = useState(false);
  const existing = new Set(snapshot?.tracks.map((t) => t.title.toLowerCase()) ?? []);
  const presets = TRACK_PRESETS.filter((p) => !existing.has(p.title.toLowerCase()));
  const chosen = TRACK_PRESETS.find((p) => p.key === preset);
  const canCreate = chosen || title.trim().length >= 2;

  const create = async () => {
    setBusy(true);
    const color = chosen?.color ?? TRACK_COLORS[(snapshot?.tracks.length ?? 0) % TRACK_COLORS.length];
    const id = await attempt("Couldn't create the track", () =>
      api.tracks.create({
        title: chosen?.title ?? title.trim(),
        subject: chosen?.subject ?? (subject.trim() || title.trim()),
        emoji: chosen?.emoji ?? emoji,
        color,
        tagline: chosen?.tagline,
        proficiency,
        kind: chosen ? 'core' : 'custom',
      }),
    );
    setBusy(false);
    if (id) {
      await api.tracks.setActive(id);
      setPreset(null);
      setTitle('');
      setSubject('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a learning track"
      subtitle="Claude designs a 10-level roadmap for any subject, tailored to your goals."
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canCreate} loading={busy} icon={<Plus className="size-4" />} onClick={() => void create()}>
            Create roadmap
          </Button>
        </>
      }
    >
      {presets.length > 0 && (
        <>
          <Label>Popular tracks</Label>
          <div className="mb-5 grid grid-cols-2 gap-2.5">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset((v) => (v === p.key ? null : p.key))}
                data-state={preset === p.key ? 'selected' : undefined}
                className="tile press flex items-start gap-3 p-3.5 text-left"
              >
                <span className="text-2xl">{p.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{p.title}</span>
                  <span className="block text-xs font-semibold text-muted">{p.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className={cn('rounded-3xl border-2 border-dashed border-line p-4', chosen && 'opacity-50')}>
        <Label>Or create your own</Label>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="no-drag h-11 w-16 cursor-pointer appearance-none rounded-2xl border-2 border-line bg-elev text-center text-xl"
              disabled={!!chosen}
            >
              {EMOJIS.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </div>
          <Input placeholder="e.g. Kubernetes, React, Kafka Streams, LLD in Java" value={title} disabled={!!chosen} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <Textarea
          className="mt-2"
          rows={2}
          disabled={!!chosen}
          placeholder="Optional: what should it cover or focus on?"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="mt-5">
        <Label>Where are you starting from?</Label>
        <Segmented value={proficiency} onChange={setProficiency} options={START_LEVEL_OPTIONS.map((o) => ({ value: o.level, label: o.label, hint: o.hint }))} />
        <p className="mt-2 text-xs font-semibold text-faint">
          You always start at Level 1 — Claude pitches Level 1 at this point, so you skip what you already know. You can test out of any level with its checkpoint.
        </p>
      </div>
    </Modal>
  );
}
