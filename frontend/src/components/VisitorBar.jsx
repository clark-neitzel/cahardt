import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const COLORS = {
  indigo: { bg:'rgba(99,102,241,.15)',  text:'#a5b4fc', border:'rgba(99,102,241,.25)', cnt:'rgba(99,102,241,.3)',  cntT:'#c7d2fe' },
  cyan:   { bg:'rgba(6,182,212,.14)',   text:'#67e8f9', border:'rgba(6,182,212,.22)',  cnt:'rgba(6,182,212,.28)', cntT:'#a5f3fc' },
  yellow: { bg:'rgba(234,179,8,.13)',   text:'#fde047', border:'rgba(234,179,8,.22)',  cnt:'rgba(234,179,8,.25)', cntT:'#fef08a' },
  green:  { bg:'rgba(34,197,94,.12)',   text:'#86efac', border:'rgba(34,197,94,.22)',  cnt:'rgba(34,197,94,.25)', cntT:'#bbf7d0' },
};

function Pill({ icon, label, count, color, loaded }) {
  const c = COLORS[color];
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'.28em .7em', borderRadius:999,
      background:c.bg, color:c.text, border:`1px solid ${c.border}`,
      fontSize:'.72rem', fontWeight:600, whiteSpace:'nowrap',
    }}>
      <span>{icon}</span>
      {label}
      <span style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        minWidth:18, height:18, borderRadius:999,
        background:c.cnt, color:c.cntT,
        fontSize:'.7rem', fontWeight:700, padding:'0 4px',
      }}>
        {loaded ? count : '—'}
      </span>
    </span>
  );
}

export default function VisitorBar({ onClose }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const cntRef = useRef(30);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/visitors/stats');
      setStats(data);
    } catch {}
    cntRef.current = 30;
    setCountdown(30);
  };

  useEffect(() => {
    if (!user) return;
    fetchStats();
    const tick = setInterval(() => {
      cntRef.current--;
      setCountdown(cntRef.current);
      if (cntRef.current <= 0) fetchStats();
    }, 1000);
    return () => clearInterval(tick);
  }, [user]);

  // Apenas desktop; não renderiza se não houver usuário
  if (!user) return null;

  const { total = 0, inicio = 0, congelados = 0, kitFesta = 0, comCarrinho = 0 } = stats || {};

  return (
    <div
      className="hidden md:flex"
      style={{
        position:'fixed', top:0, left:0, right:0, zIndex:60,
        height:38, padding:'0 16px',
        background:'linear-gradient(90deg,#0f1923 0%,#172030 100%)',
        borderBottom:'1px solid rgba(255,255,255,.08)',
        alignItems:'center', gap:0,
        boxShadow:'0 2px 12px rgba(0,0,0,.25)',
        fontSize:'.75rem', fontWeight:500,
      }}
    >
      {/* bolinha pulsante */}
      <span style={{
        width:8, height:8, borderRadius:'50%', background:'#22c55e',
        flexShrink:0, marginRight:10,
        boxShadow:'0 0 0 3px rgba(34,197,94,.2)',
        animation:'vbPulse 2s ease infinite',
      }}/>

      <span style={{color:'rgba(255,255,255,.4)', marginRight:10, whiteSpace:'nowrap'}}>Site agora</span>
      <span style={{color:'#fff', fontWeight:700, fontSize:'.88rem', marginRight:14}}>{stats ? total : '—'}</span>

      {/* separador */}
      <span style={{width:1, height:18, background:'rgba(255,255,255,.1)', margin:'0 14px', flexShrink:0}}/>

      {/* páginas */}
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <Pill icon="🏠" label="Início"      count={inicio}     color="indigo" loaded={!!stats}/>
        <Pill icon="❄️" label="Congelados"  count={congelados} color="cyan"   loaded={!!stats}/>
        <Pill icon="🎉" label="Kit Festa"   count={kitFesta}   color="yellow" loaded={!!stats}/>
      </div>

      <span style={{width:1, height:18, background:'rgba(255,255,255,.1)', margin:'0 14px', flexShrink:0}}/>
      <Pill icon="🛒" label="Com carrinho" count={comCarrinho} color="green" loaded={!!stats}/>

      <div style={{flex:1}}/>

      {/* contador */}
      <span style={{color:'rgba(255,255,255,.28)', fontSize:'.68rem', marginRight:12, whiteSpace:'nowrap'}}>
        atualiza em {countdown}s
      </span>

      {/* fechar */}
      <button
        onClick={onClose}
        title="Ocultar barra"
        style={{
          width:24, height:24, borderRadius:6,
          background:'none', border:'none', cursor:'pointer',
          color:'rgba(255,255,255,.3)', fontSize:'1rem',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(255,255,255,.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,.3)'; e.currentTarget.style.background='none'; }}
      >✕</button>

      <style>{`
        @keyframes vbPulse {
          0%   { box-shadow:0 0 0 0   rgba(34,197,94,.4); }
          70%  { box-shadow:0 0 0 6px rgba(34,197,94,0);  }
          100% { box-shadow:0 0 0 0   rgba(34,197,94,0);  }
        }
      `}</style>
    </div>
  );
}
