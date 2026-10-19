'use client';

export function FriendButton({ state, onAdd, onAccept }) {
  if (state === 'friends') return <span className="muted small">Friends</span>;
  if (state === 'requested') return <span className="muted small">Requested</span>;
  if (state === 'incoming')
    return (
      <button className="btn sm primary" onClick={onAccept}>
        Accept
      </button>
    );
  return (
    <button className="btn sm" onClick={onAdd}>
      Add friend
    </button>
  );
}
