import hljs from 'highlight.js/lib/common';
import { AlertTriangle, Check, Copy, Info, Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/api';
import { cn } from '../lib/format';

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

function hastText(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(hastText).join('');
}

function languageOf(node: HastNode | undefined): string | undefined {
  const cls = node?.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? cls.split(' ') : [];
  return list.find((c) => c.startsWith('language-'))?.slice('language-'.length);
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-white/60 hover:bg-white/10 hover:text-white"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeShell({ language, raw, children }: { language?: string; raw: string; children: ReactNode }) {
  return (
    <div className="code-block group my-4">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-1.5">
        <span className="text-[11px] font-bold tracking-wider text-white/45 uppercase">{language || 'code'}</span>
        <CopyButton text={raw} />
      </div>
      <pre className="overflow-x-auto px-4 py-3">{children}</pre>
    </div>
  );
}

/** Standalone highlighted code (question snippets). */
export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  const html = useMemo(() => {
    try {
      const lang = language && hljs.getLanguage(language) ? language : undefined;
      return lang ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value;
    } catch {
      return null;
    }
  }, [code, language]);
  return (
    <div className={cn('code-block', className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-1.5">
        <span className="text-[11px] font-bold tracking-wider text-white/45 uppercase">{language || 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3">
        {html !== null ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  );
}

type MermaidApi = typeof import('mermaid').default;
let mermaidLoader: Promise<MermaidApi> | null = null;

function Mermaid({ code, streaming }: { code: string; streaming?: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const dark = document.documentElement.dataset.theme === 'dark';
  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    const id = `mmd-${Math.random().toString(36).slice(2)}`;
    (mermaidLoader ??= import('mermaid').then((m) => m.default))
      .then(async (mermaid) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: 'Nunito Variable' });
        const ok = await mermaid.parse(code, { suppressErrors: true });
        if (!ok) throw new Error('invalid diagram');
        const out = await mermaid.render(id, code);
        if (!cancelled) setSvg(out.svg);
      })
      .catch(() => {
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, streaming, dark]);
  if (failed) return <CodeBlock code={code} language="mermaid" className="my-4" />;
  if (!svg) return <div className="shimmer my-4 h-44 rounded-2xl" />;
  return <div className="mermaid-box my-4 flex justify-center rounded-2xl border-2 border-line bg-elev p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Callout({ node, children }: { node?: HastNode; children?: ReactNode }) {
  const text = hastText(node).trim().toLowerCase();
  const kind = text.startsWith('interview tip') ? 'tip' : /^(warning|pitfall|gotcha|caution|careful)/.test(text) ? 'warn' : 'info';
  const style = {
    tip: 'border-brand/40 bg-brand-soft text-brand-ink',
    warn: 'border-warn/50 bg-warn-soft text-warn-ink',
    info: 'border-info/40 bg-info-soft text-info-ink',
  }[kind];
  const icon = { tip: <Lightbulb className="size-5" />, warn: <AlertTriangle className="size-5" />, info: <Info className="size-5" /> }[kind];
  return (
    <div className={cn('my-4 flex gap-3 rounded-2xl border-2 px-4 py-3 [&_p]:my-1', style)}>
      <div className="mt-1 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1 text-[15px] font-semibold">{children}</div>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, streaming, className }: { text: string; streaming?: boolean; className?: string }) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href) void api.app.openExternal(href);
          }}
        >
          {children}
        </a>
      ),
      pre: ({ node, children }) => {
        const codeNode = (node as HastNode | undefined)?.children?.find((c) => c.tagName === 'code');
        const language = languageOf(codeNode);
        const raw = hastText(codeNode).replace(/\n$/, '');
        if (language === 'mermaid') return <Mermaid code={raw} streaming={streaming} />;
        return (
          <CodeShell language={language} raw={raw}>
            {children}
          </CodeShell>
        );
      },
      blockquote: ({ node, children }) => <Callout node={node as HastNode | undefined}>{children}</Callout>,
      table: ({ children }) => (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      ),
    }),
    [streaming],
  );
  return (
    <div className={cn('prose-ascend', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { plainText: ['mermaid', 'text'] }]]} components={components}>
        {text}
      </ReactMarkdown>
      {streaming && <span className="stream-caret" />}
    </div>
  );
});

/** Lightweight inline formatting for short strings (options, chips): `code` and **bold**. */
export function InlineText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[0.88em] font-semibold">
              {p.slice(1, -1)}
            </code>
          );
        }
        if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}
