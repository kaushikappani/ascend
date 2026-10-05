import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button, Input, Label, Select, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { attempt, useApp } from '../../lib/store';

const SENIORITY = ['', 'Intern', 'Junior', 'Mid-level', 'Senior', 'Staff', 'Principal', 'Engineering Manager'];

export function NewTargetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useApp((s) => s.navigate);
  const research = useApp((s) => s.snapshot?.settings.research);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [seniority, setSeniority] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [jd, setJd] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = company.trim() && role.trim() && jd.trim().length >= 40;

  const submit = async () => {
    setBusy(true);
    const id = await attempt("Couldn't create the target", () =>
      api.targets.create({ company, role, seniority, location, interviewDate: date || undefined, jobDescription: jd, notes }),
    );
    setBusy(false);
    if (!id) return;
    setCompany('');
    setRole('');
    setSeniority('');
    setLocation('');
    setDate('');
    setJd('');
    setNotes('');
    onClose();
    navigate({ name: 'target', id });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title="Prepare for a specific job"
      subtitle="Claude researches the company on the web, analyses the job description against your profile, and builds a prep plan and question track for this exact role."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void submit()}>
            Research & build my prep
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Company</Label>
            <Input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Atlassian" />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
          </div>
          <div>
            <Label hint="optional">Seniority</Label>
            <Select value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              {SENIORITY.map((s) => (
                <option key={s} value={s}>
                  {s || 'Not specified'}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label hint="optional">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bengaluru" />
            </div>
            <div>
              <Label hint="optional">Interview date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <Label hint={`${jd.trim().length} characters`}>Job description</Label>
          <Textarea rows={9} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full job description here — responsibilities, requirements, nice-to-haves…" />
        </div>
        <div>
          <Label hint="optional">Anything else?</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Recruiter said 4 rounds: DSA, LLD, HLD, hiring manager. Team works on payments." />
        </div>
        {research === 'off' && (
          <div className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn-ink">
            Web research is turned off in Settings, so the brief will rely on Claude's own knowledge.
          </div>
        )}
      </div>
    </Modal>
  );
}
