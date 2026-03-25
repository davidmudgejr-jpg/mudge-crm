import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';

// Author display config
const AUTHOR_CONFIG = {
  houston_command: { name: 'Houston Command', model: 'Opus 4.6', color: '#10b981', tier: '1', icon: '🧠' },
  ralph_gpt: { name: 'Ralph GPT', model: 'GPT-4', color: '#f59e0b', tier: '2', icon: '🔍' },
  ralph_gemini: { name: 'Ralph Gemini', model: 'Gemini Pro', color: '#ef4444', tier: '2', icon: '💎' },
  david: { name: 'David', model: '', color: '#3b82f6', tier: '0', icon: '👤' },
  system: { name: 'System', model: '', color: '#6b7280', tier: '', icon: '⚙️' },
};

const ROUND_LABELS = {
  opening_brief: { label: 'Opening Brief', icon: '📋', color: '#10b981' },
  independent_analysis: { label: 'Independent Analysis', icon: '🔬', color: '#3b82f6' },
  debate: { label: 'Debate', icon: '⚔️', color: '#f59e0b' },
  proposals: { label: 'Proposals', icon: '💡', color: '#8b5cf6' },
  final_report: { label: 'Final Report', icon: '📊', color: '#10b981' },
  follow_up: { label: 'Follow Up', icon: '🔄', color: '#6b7280' },
};

const REACTION_OPTIONS = [
  { key: 'agree', label: 'Agree', icon: '👍' },
  { key: 'disagree', label: 'Disagree', icon: '👎' },
  { key: 'interesting', label: 'Interesting', icon: '🤔' },
  { key: 'implement', label: 'Implement This', icon: '🚀' },
];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function MeetingCard({ meeting, onClick, isSelected }) {
  const statusColors = {
    completed: '#10b981',
    in_progress: '#f59e0b',
    scheduled: '#3b82f6',
    cancelled: '#6b7280',
  };

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        background: isSelected ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
        border: isSelected ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#e5e7eb', flex: 1 }}>
          {meeting.title}
        </span>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 10,
          background: `${statusColors[meeting.status] || '#6b7280'}20`,
          color: statusColors[meeting.status] || '#6b7280',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          marginLeft: 8,
        }}>
          {meeting.status}
        </span>
      </div>
      {meeting.topic && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{meeting.topic}</div>
      )}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
        <span>#{meeting.meeting_number}</span>
        <span>{meeting.post_count || 0} posts</span>
        {meeting.proposal_count > 0 && <span style={{ color: '#8b5cf6' }}>{meeting.proposal_count} proposals</span>}
        <span>{timeAgo(meeting.created_at)}</span>
      </div>
    </div>
  );
}

function PostCard({ post, onReact }) {
  const [expanded, setExpanded] = useState(true);
  const author = AUTHOR_CONFIG[post.author] || AUTHOR_CONFIG.system;
  const round = ROUND_LABELS[post.round];

  return (
    <div style={{
      padding: '16px',
      borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{author.icon}</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: author.color }}>{author.name}</span>
          {author.model && (
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 6,
              background: `${author.color}15`,
              color: author.color,
              fontWeight: 500,
            }}>
              {author.model}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {round && (
            <span style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              background: `${round.color}15`,
              color: round.color,
              fontWeight: 600,
            }}>
              {round.icon} {round.label}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#6b7280' }}>{timeAgo(post.created_at)}</span>
        </div>
      </div>

      {/* Body */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: 13,
          color: '#d1d5db',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          cursor: 'pointer',
          maxHeight: expanded ? 'none' : 120,
          overflow: expanded ? 'visible' : 'hidden',
          position: 'relative',
        }}
      >
        {post.body}
        {!expanded && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: 'linear-gradient(transparent, rgba(10,10,16,0.95))',
          }} />
        )}
      </div>

      {/* Proposal badge */}
      {post.has_proposal && (
        <div style={{
          marginTop: 10,
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(139,92,246,0.1)',
          border: '1px solid rgba(139,92,246,0.2)',
          fontSize: 12,
          color: '#8b5cf6',
          fontWeight: 600,
        }}>
          💡 Contains improvement proposal
        </div>
      )}

      {/* David's reaction */}
      {post.david_reaction && (
        <div style={{
          marginTop: 8,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.2)',
          fontSize: 12,
          color: '#3b82f6',
          display: 'inline-block',
        }}>
          David: {REACTION_OPTIONS.find(r => r.key === post.david_reaction)?.icon} {post.david_reaction}
        </div>
      )}

      {/* Reaction buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {REACTION_OPTIONS.map(r => (
          <button
            key={r.key}
            onClick={(e) => { e.stopPropagation(); onReact(post.id, r.key); }}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: post.david_reaction === r.key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: post.david_reaction === r.key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
              color: post.david_reaction === r.key ? '#3b82f6' : '#9ca3af',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontWeight: post.david_reaction === r.key ? 600 : 400,
            }}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CouncilMeetings() {
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [roundFilter, setRoundFilter] = useState('all');

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch meetings list
  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/ai/council-meetings?limit=50`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch posts for a meeting
  const fetchPosts = useCallback(async (meetingId) => {
    setLoadingPosts(true);
    try {
      const res = await fetch(`${API}/api/ai/council-meetings/${meetingId}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setSelectedMeeting(data.meeting);
      setPosts(data.posts || []);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  // React to a post
  const handleReact = async (postId, reaction) => {
    try {
      const meetingId = selectedMeeting?.meeting_id;
      if (!meetingId) return;

      const res = await fetch(`${API}/api/ai/council-meetings/${meetingId}/posts/${postId}/react`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      if (!res.ok) return;

      // Optimistic update
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, david_reaction: reaction } : p
      ));
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };

  // Filter posts by round
  const filteredPosts = roundFilter === 'all'
    ? posts
    : posts.filter(p => p.round === roundFilter);

  // Get unique rounds in this meeting for filter tabs
  const availableRounds = [...new Set(posts.map(p => p.round).filter(Boolean))];

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16 }}>
      {/* Left: Meeting list */}
      <div style={{
        width: 320,
        minWidth: 320,
        overflowY: 'auto',
        padding: '16px 0',
      }}>
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>
            Council of Minds
          </h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Tri-model strategic review sessions
          </p>
        </div>

        {loading ? (
          <div style={{ padding: '20px 16px', color: '#6b7280', fontSize: 13 }}>Loading meetings...</div>
        ) : meetings.length === 0 ? (
          <div style={{ padding: '20px 16px' }}>
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
              No meetings yet. Houston Command will start the first Council of Minds session automatically on schedule (Tue/Fri/Sun at 2 AM).
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 8px' }}>
            {meetings.map(m => (
              <MeetingCard
                key={m.meeting_id}
                meeting={m}
                isSelected={selectedMeeting?.meeting_id === m.meeting_id}
                onClick={() => fetchPosts(m.meeting_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: Thread view */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {!selectedMeeting ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#6b7280',
            fontSize: 14,
          }}>
            Select a meeting to view the discussion thread
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{ padding: '0 16px', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>
                {selectedMeeting.title}
              </h3>
              {selectedMeeting.topic && (
                <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{selectedMeeting.topic}</p>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                <span>Meeting #{selectedMeeting.meeting_number}</span>
                <span>{posts.length} posts</span>
                {selectedMeeting.duration_minutes && <span>{selectedMeeting.duration_minutes} min</span>}
                <span>{new Date(selectedMeeting.created_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                })}</span>
              </div>

              {/* Summary */}
              {selectedMeeting.summary && (
                <div style={{
                  marginTop: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.15)',
                  fontSize: 13,
                  color: '#d1d5db',
                  lineHeight: 1.6,
                }}>
                  <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 6, fontSize: 12 }}>
                    Meeting Summary
                  </div>
                  {selectedMeeting.summary}
                </div>
              )}
            </div>

            {/* Round filter tabs */}
            {availableRounds.length > 1 && (
              <div style={{
                display: 'flex',
                gap: 6,
                padding: '0 16px',
                marginBottom: 12,
                flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => setRoundFilter('all')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: roundFilter === 'all' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    background: roundFilter === 'all' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                    color: roundFilter === 'all' ? '#10b981' : '#9ca3af',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: roundFilter === 'all' ? 600 : 400,
                  }}
                >
                  All
                </button>
                {availableRounds.map(r => {
                  const info = ROUND_LABELS[r];
                  return (
                    <button
                      key={r}
                      onClick={() => setRoundFilter(r)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: roundFilter === r ? `1px solid ${info?.color || '#6b7280'}40` : '1px solid rgba(255,255,255,0.08)',
                        background: roundFilter === r ? `${info?.color || '#6b7280'}15` : 'rgba(255,255,255,0.04)',
                        color: roundFilter === r ? (info?.color || '#9ca3af') : '#9ca3af',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: roundFilter === r ? 600 : 400,
                      }}
                    >
                      {info?.icon} {info?.label || r}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Posts */}
            <div style={{ padding: '0 16px' }}>
              {loadingPosts ? (
                <div style={{ color: '#6b7280', fontSize: 13 }}>Loading thread...</div>
              ) : filteredPosts.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13 }}>No posts in this round yet.</div>
              ) : (
                filteredPosts.map(post => (
                  <PostCard key={post.id} post={post} onReact={handleReact} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
