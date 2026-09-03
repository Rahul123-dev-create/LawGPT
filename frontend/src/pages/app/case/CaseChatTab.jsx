import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Loader2, Send, Trash2, MessageSquare, Bot, User, FileText,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import chatService from '../../../services/chatService';

const QUICK_QUERIES = [
  'What are the primary grounds under Section 27A?',
  'Summarize the key arguments in this case',
  'List all parties and their roles',
  'What evidence has been submitted?',
];

function CitationCard({ citation }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <div className="flex items-center gap-2">
        <FileText className="h-3 w-3 shrink-0 text-primary" />
        <span className="text-xs font-medium truncate">{citation.documentName || citation.document_name || 'Document'}</span>
        <Badge variant="outline" className="ml-auto shrink-0 px-1.5 py-0 text-[10px]">
          p.{citation.pageNumber || citation.page_number}
        </Badge>
      </div>
      {(citation.snippet || citation.text) && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-3">
          {citation.snippet || citation.text}
        </p>
      )}
      {(citation.score || citation.score === 0) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Relevance:</span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${Math.min(100, citation.score)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(citation.score)}%</span>
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ message }) {
  const [citationsOpen, setCitationsOpen] = useState(false);
  const citations = message.citations || [];
  const hasCitations = citations.length > 0;

  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
        {hasCitations && (
          <div className="rounded-md border border-border">
            <button
              onClick={() => setCitationsOpen(!citationsOpen)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {citations.length} source{citations.length !== 1 ? 's' : ''} cited
              </span>
              {citationsOpen ? (
                <ChevronUp className="ml-auto h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
              )}
            </button>
            {citationsOpen && (
              <div className="space-y-1.5 border-t border-border p-2.5">
                {citations.map((c, i) => (
                  <CitationCard key={i} citation={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
      </div>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function CaseChatTab() {
  const { caseId } = useOutletContext();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const history = await chatService.getCaseChat(caseId);
      setMessages(history || []);
    } catch (err) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.message || err.message || 'Could not load chat history');
      }
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    setLoading(true);
    setError('');
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = async (queryText) => {
    const text = (queryText || input).trim();
    if (!text || sending) return;

    setInput('');
    setError('');

    // Add user message optimistically
    const userMsg = { role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const result = await chatService.sendMessageToCase(caseId, text);
      // Replace with server response (includes persisted IDs)
      setMessages((prev) => {
        const withoutOptimistic = prev.slice(0, -1);
        return [
          ...withoutOptimistic,
          result.userMessage || userMsg,
          result.assistantMessage || { role: 'assistant', content: 'No response received.', citations: [] },
        ];
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to send message');
      // Remove optimistic user message on failure
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all chat messages for this case? This cannot be undone.')) return;
    try {
      await chatService.clearCaseChat(caseId);
      setMessages([]);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to clear chat');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold">Case Assistant</h2>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={messages.length === 0 || sending}
        >
          <Trash2 className="mr-1.5 h-3 w-3" />
          Clear
        </Button>
      </div>

      {/* Quick query chips */}
      {messages.length === 0 && !loading && (
        <div className="border-b border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Quick queries</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                disabled={sending}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Message feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading chat history...</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">Start a conversation</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Ask questions about this case. The assistant will search through case documents
              and provide grounded answers with citations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              msg.role === 'user' ? (
                <UserMessage key={msg._id || i} message={msg} />
              ) : (
                <AssistantMessage key={msg._id || i} message={msg} />
              )
            ))}
            {sending && (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary/50">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this case..."
            rows={1}
            className="min-h-[24px] max-h-[150px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            disabled={sending}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
