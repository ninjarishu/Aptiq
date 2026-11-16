import { useEffect, useState } from 'react'
import './App.css'
import { playSound, readAudioPrefs, saveAudioPrefs, type AudioPrefs } from './audio'
import { supabase, supabaseConfigured } from './supabase'
import { createTask, deleteTask, fetchFocusSessions, fetchTasks, finishFocus, startFocus, updateTask, type FocusRecord, type TaskRecord } from './data'

type Task = TaskRecord
const pages = ['Dashboard', 'Planner', 'My Tasks', 'Focus', 'Analytics', 'Settings']
const icons = ['dashboard','planner','tasks','focus','analytics','settings']

function Icon({name}:{name:string}) {
  const paths:Record<string,string>={dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',planner:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',tasks:'M5 4h14v16H5z M8 12l2.5 2.5L16 9',focus:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',analytics:'M4 20V11 M10 20V5 M16 20v-8 M22 20H2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.8.4l-.1.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.5-1.1 1.7 1.7 0 0 0-1.4.7l-.1.1-3.1-1.8.1-.2a1.7 1.7 0 0 0-.4-1.8l-.1-.1v-3.6l.2-.1a1.7 1.7 0 0 0 .4-1.8l-.1-.2 1.8-3.1.2.1a1.7 1.7 0 0 0 1.8-.4l.1-.1h3.6l.1.2a1.7 1.7 0 0 0 1.8.4l.2-.1 3.1 1.8-.1.2a1.7 1.7 0 0 0 .4 1.8l.1.1z',close:'M6 6l12 12 M18 6 6 18',plus:'M12 5v14 M5 12h14'}
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]||paths.tasks}/></svg>
}

function Logo() { return <img className="aptiq-logo" src="/aptiq-mark.png" alt="Aptiq" /> }

function App() {
  const [page, setPage] = useState('Dashboard')
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem('aptiq-tasks') || '[]') } catch { return [] }
  })
  const [focusSessions,setFocusSessions]=useState<FocusRecord[]>([])
  const [dataLoading,setDataLoading]=useState(false)
  const [activeFocusId,setActiveFocusId]=useState<string|null>(null)
  const [focusStartedAt,setFocusStartedAt]=useState<number|null>(null)
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')
  const [taskDialog, setTaskDialog] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPriority, setDraftPriority] = useState<Task['priority']>('Medium')
  const [draftMinutes, setDraftMinutes] = useState(30)
  const [schedule, setSchedule] = useState<Task[]>([])
  const [scheduleDialog, setScheduleDialog] = useState(false)
  const [startAt, setStartAt] = useState('09:00')
  const [finishAt, setFinishAt] = useState('17:00')
  const [breakCount, setBreakCount] = useState(2)
  const [audioPrefs, setAudioPrefs] = useState<AudioPrefs>(readAudioPrefs)
  const [timerMinutes, setTimerMinutes] = useState(25)
  const [now, setNow] = useState(new Date())
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabaseConfigured)
  const [authMode, setAuthMode] = useState<'welcome'|'login'|'register'|'reset'|'update'>('welcome')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [guestMode, setGuestMode] = useState(() => localStorage.getItem('aptiq-guest') === '1')
  useEffect(() => {
    const client=supabase
    if (!client) { setAuthReady(true); return }
    let active=true
    let subscription:{unsubscribe:()=>void}|undefined
    void client.auth.getSession().then(({data,error})=>{
      if(!active)return
      if(error)setNotice('Could not restore your sign-in. Please log in again.')
      setSession(data.session)
      if(data.session){setGuestMode(false);localStorage.removeItem('aptiq-guest')}
      setAuthReady(true)
      const listener=client.auth.onAuthStateChange((event,next)=>{
        setSession(next)
        if(event==='SIGNED_IN'&&next){setGuestMode(false);localStorage.removeItem('aptiq-guest')}
        if(event==='PASSWORD_RECOVERY')setAuthMode('update')
      })
      subscription=listener.data.subscription
    }).catch(()=>{if(active){setAuthReady(true);setNotice('Could not connect to authentication. Check your connection and try again.')}})
    return ()=>{active=false;subscription?.unsubscribe()}
  }, [])
  const submitAuth = async () => {
    const client=supabase
    if (!client) { setNotice('Add the Supabase URL and publishable key to .env.local first.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setNotice('Enter a valid email address.'); return }
    if (authMode !== 'reset' && password.length < 8) { setNotice('Password must be at least 8 characters.'); return }
    if ((authMode === 'register'||authMode==='update') && password !== confirmPassword) { setNotice('Passwords do not match.'); return }
    setAuthBusy(true)
    try {
      const result = authMode === 'login' ? await client.auth.signInWithPassword({email,password}) : authMode === 'register' ? await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}}) : authMode==='update' ? await client.auth.updateUser({password}) : await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin})
      if(result.error)throw result.error
      const authSession=(result.data as {session?:import('@supabase/supabase-js').Session|null}).session??null
      if(authMode==='register'){
        if(authSession){setSession(authSession);setGuestMode(false);localStorage.removeItem('aptiq-guest');setNotice('Account created and signed in.')}
        else setNotice('Account created. Check your email to verify your address, then return here to sign in.')
      } else if(authMode==='reset')setNotice('If an account exists for that address, a password reset link has been sent.')
      else if(authMode==='update'){setNotice('Password updated. Please sign in with your new password.');await client.auth.signOut();setSession(null);setAuthMode('login')}
      else {setSession(authSession);setGuestMode(false);localStorage.removeItem('aptiq-guest');setNotice('Signed in successfully.')}
    } catch(error) { setNotice(error instanceof Error?error.message:'Authentication failed. Please try again.') }
    finally { setAuthBusy(false) }
  }
  const logout = async () => { if(session&&supabase){const {error}=await supabase.auth.signOut();if(error){setNotice(`Could not log out: ${error.message}`);return}}setSession(null);setGuestMode(false);localStorage.removeItem('aptiq-guest');setAuthMode('welcome') }
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id) }, [])
  useEffect(() => { if(guestMode || !session) localStorage.setItem('aptiq-tasks', JSON.stringify(tasks)) }, [tasks,guestMode,session])
  useEffect(() => {
    if(!session)return
    let alive=true;setDataLoading(true)
    void Promise.all([fetchTasks(),fetchFocusSessions()]).then(([cloudTasks,sessions])=>{if(alive){setTasks(cloudTasks);setFocusSessions(sessions)}}).catch(error=>setNotice(`Could not load account data: ${error.message||'database unavailable'}`)).finally(()=>{if(alive)setDataLoading(false)})
    return ()=>{alive=false}
  },[session?.user.id])
  useEffect(() => { saveAudioPrefs(audioPrefs) }, [audioPrefs])
  useEffect(()=>{if(seconds!==0||!session||!activeFocusId||!focusStartedAt)return;const id=activeFocusId,elapsed=Math.max(0,Math.floor((Date.now()-focusStartedAt)/1000));setActiveFocusId(null);setFocusStartedAt(null);void finishFocus(id,elapsed,'completed').then(()=>fetchFocusSessions().then(setFocusSessions)).catch(error=>setNotice(`Could not save completed session: ${error.message}`))},[seconds,session,activeFocusId,focusStartedAt])
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSeconds(s => {
      if (s <= 1) { setRunning(false); setNotice('Focus session complete'); window.setTimeout(() => setNotice(''), 2200); return 0 }
      return s - 1
    }), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const done = tasks.filter(t => t.done).length
  const total = tasks.length
  const focusMinutes=focusSessions.filter(s=>s.status==='completed'&&s.actual_duration>0).reduce((sum,s)=>sum+s.actual_duration,0)/60
  const toggle = (id: string) => { const task=tasks.find(t=>t.id===id);if(!task)return;const updated={...task,done:!task.done};setTasks(current=>current.map(t=>t.id===id?updated:t));if(session)void updateTask(updated).catch(error=>{setTasks(current=>current.map(t=>t.id===id?task:t));setNotice(`Could not update task: ${error.message}`)});playSound('complete', audioPrefs) }
  const add = () => { setDraftName(''); setTaskDialog(true); playSound('open', audioPrefs) }
  const saveTask = () => { if (!draftName.trim()) return; const task={title:draftName.trim(),due:'Today',priority:draftPriority,done:false,minutes:Math.max(1,draftMinutes),subject:''};if(session){void createTask(task).then(saved=>setTasks(current=>[saved,...current])).catch(error=>setNotice(`Could not save task: ${error.message}`))}else setTasks(current=>[{...task,id:crypto.randomUUID()},...current]);setTaskDialog(false);setDraftName('');playSound('create',audioPrefs);setNotice('Task added') }
  const generateSchedule = () => { const pending=tasks.filter(t=>!t.done); if(!pending.length)return; const [sh,sm]=startAt.split(':').map(Number),[eh,em]=finishAt.split(':').map(Number); let cursor=sh*60+sm,end=eh*60+em; if(end<=cursor)end+=1440; if(pending.reduce((n,t)=>n+t.minutes,0)+breakCount*10>end-cursor){setNotice('Tasks do not fit before finish time');return} const blocks:Task[]=[]; pending.forEach((task,i)=>{blocks.push({...task,due:`${String(Math.floor(cursor/60)%24).padStart(2,'0')}:${String(cursor%60).padStart(2,'0')}`});cursor+=task.minutes;if(breakCount&&i<pending.length-1&&((i+1)%Math.ceil(pending.length/breakCount))===0)cursor+=10});setSchedule(blocks);setScheduleDialog(false);setNotice('Schedule generated');playSound('schedule',audioPrefs) }
  const remove = (id: string) => { const previous=tasks;setTasks(current=>current.filter(t=>t.id!==id));if(session)void deleteTask(id).catch(error=>{setTasks(previous);setNotice(`Could not delete task: ${error.message}`)}) }
  const formatTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const beginSession = async () => { if (seconds === 0) setSeconds(timerMinutes * 60); if(session){try{setActiveFocusId(await startFocus(timerMinutes,tasks.find(t=>!t.done)?.id||null))}catch(error){setNotice(`Could not start session: ${(error as Error).message}`);return}} setFocusStartedAt(Date.now());setRunning(true) }
  const pauseSession = () => {setRunning(false);if(session&&activeFocusId&&focusStartedAt){const id=activeFocusId,elapsed=Math.max(0,Math.floor((Date.now()-focusStartedAt)/1000));void finishFocus(id,elapsed,'interrupted').then(()=>fetchFocusSessions().then(setFocusSessions)).catch(error=>setNotice(`Could not save paused session: ${error.message}`))}setActiveFocusId(null);setFocusStartedAt(null)}
  const endSession = () => { setRunning(false); if(session&&activeFocusId&&focusStartedAt){const elapsed=Math.min(timerMinutes*60,Math.floor((Date.now()-focusStartedAt)/1000));void finishFocus(activeFocusId,elapsed,seconds===0?'completed':'cancelled').then(()=>fetchFocusSessions().then(setFocusSessions)).catch(error=>setNotice(`Could not save focus session: ${error.message}`))}setActiveFocusId(null);setFocusStartedAt(null);setSeconds(timerMinutes * 60) }
  const hour=now.getHours()
  const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'
  if (!authReady) return <div className="startup"><div className="startup-card">Restoring session...</div></div>
  if ((!session && !guestMode) || authMode === 'update') return <div className="startup"><div className="startup-card"><div className="brand"><Logo /></div><h1>{authMode === 'welcome' ? 'Plan with purpose.' : authMode === 'login' ? 'Welcome back' : authMode === 'register' ? 'Create your account' : 'Reset password'}</h1>{authMode === 'welcome' ? <><button onClick={() => setAuthMode('login')}>Log in</button><button onClick={() => setAuthMode('register')}>Create account</button><button onClick={() => { setGuestMode(true); localStorage.setItem('aptiq-guest','1') }}>Continue as guest</button></> : <><label>Email<input value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input type={passwordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} /><button onClick={() => setPasswordVisible(v => !v)}>Show/hide</button></label><label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label><button disabled={authBusy} onClick={submitAuth}>{authBusy ? 'Please wait' : 'Continue'}</button><button onClick={() => setAuthMode('welcome')}>Back</button></>}</div>{notice}</div>
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><Logo /></div><nav aria-label="Main navigation">{pages.map((p,i)=><button key={p} className={`nav-item ${page===p?'active':''}`} onClick={()=>setPage(p)} aria-current={page===p?'page':undefined}><span className="nav-icon"><Icon name={icons[i]} /></span><span>{p}</span></button>)}</nav><button className="side-foot" onClick={logout}>{session?'Log out':'Leave guest mode'}</button></aside><main className="main-area"><header className="topline"><span>{now.toLocaleString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'})}</span><span>{dataLoading?'Syncing account…':'Your day, in focus'}</span></header><h1>{page==='Dashboard'?`${greeting}, Hrishith!`:page}</h1>
  {page==='Dashboard'&&<><div className="stats-grid">{[[total,'Total Tasks'],[done,'Completed'],[total-done,'Pending']].map(([n,label])=><article className="stat-card" key={label}><strong>{n}</strong><span>{label}</span></article>)}</div><div className="columns"><section className="panel"><div className="panel-title"><h2>Today's Tasks</h2><span>{done} / {total} complete</span></div><div className="progress-track"><i style={{width:`${total?done/total*100:0}%`}}/></div><TaskList tasks={tasks.filter(t=>!t.done)} toggle={toggle} remove={remove}/><AddTask onAdd={add}/></section><section className="panel"><h2>Productivity</h2><strong>{Math.round(focusMinutes)} min</strong><p className="muted">Recorded focus time</p></section></div></>}
  {page==='My Tasks'&&<section className="panel"><div className="panel-title"><h2>All tasks</h2><span>{done} completed</span></div><TaskList tasks={tasks} toggle={toggle} remove={remove}/><AddTask onAdd={add}/></section>}
  {page==='Planner'&&<div className="columns"><section className="panel"><h2>Tasks to schedule</h2><TaskList tasks={tasks.filter(t=>!t.done)} toggle={toggle} remove={remove}/><button className="primary" onClick={()=>setScheduleDialog(true)}>Create schedule</button></section><section className="panel"><h2>Today's Calendar</h2>{schedule.length?schedule.map(t=><div className="schedule-block" key={t.id}><span>{t.due}</span>{t.title} · {t.minutes} min</div>):<p className="muted">Create a schedule from pending tasks.</p>}</section></div>}
  {page==='Focus'&&<div className="columns"><section className="panel focus-panel"><div className="current-task">Current Task <strong>{tasks.find(t=>!t.done)?.title||'All caught up!'}</strong></div><label className="timer-setting">Session length <input type="number" min="1" max="180" value={timerMinutes} disabled={running} onChange={e=>{const m=Math.max(1,Number(e.target.value));setTimerMinutes(m);setSeconds(m*60)}}/> min</label><div className={`timer-ring ${running?'is-running':''} ${seconds===0?'is-complete':''}`}><strong>{formatTime}</strong><span>{seconds===0?'Session complete':running?'Focus session':'Paused'}</span></div><div className="button-row"><button className="primary" onClick={beginSession} disabled={running}>Start</button><button onClick={pauseSession} disabled={!running}>Pause</button><button onClick={endSession}>End / Reset</button></div></section><section className="panel"><h2>Today's Progress</h2><p className="muted">{done} / {total} tasks complete</p><div className="progress-track"><i style={{width:`${total?done/total*100:0}%`}}/></div></section></div>}
  {page==='Analytics'&&<section className="panel"><h2>Analytics</h2>{focusSessions.length?`${Math.round(focusMinutes)} focus minutes · ${focusSessions.filter(s=>s.status==='completed').length} completed sessions`:'No completed focus session data yet.'}</section>}
  {page==='Settings'&&<section className="panel settings"><h2>Preferences</h2><label>Sound effects<input type="checkbox" checked={audioPrefs.enabled} onChange={e=>setAudioPrefs(p=>({...p,enabled:e.target.checked}))}/></label><label>Master volume<input type="range" min="0" max="1" step=".05" value={audioPrefs.volume} onChange={e=>setAudioPrefs(p=>({...p,volume:Number(e.target.value)}))}/></label><label>Focus notifications<input type="checkbox" checked={audioPrefs.focus} onChange={e=>setAudioPrefs(p=>({...p,focus:e.target.checked}))}/></label><button onClick={()=>playSound('preview',audioPrefs)}>Preview sound</button><button className="welcome-secondary" onClick={logout}>{session?'Log out':'Leave guest mode'}</button></section>}
  {notice&&<div className="toast">{notice}</div>}
  {taskDialog&&<div className="dialog-backdrop"><section className="dialog" aria-labelledby="create-task-heading"><h2 id="create-task-heading">Create task</h2><label>Task name<input value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="Task name"/></label><label>Difficulty<select className={`difficulty-select difficulty-${draftPriority.toLowerCase()}`} value={draftPriority} onChange={e=>setDraftPriority(e.target.value as Task['priority'])}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Target time<input type="number" min="1" value={draftMinutes} onChange={e=>setDraftMinutes(Number(e.target.value))}/></label><div className="button-row"><button type="button" onClick={()=>setTaskDialog(false)}>Cancel</button><button className="primary" onClick={saveTask} disabled={!draftName.trim()}>Create task</button></div></section></div>}
  {scheduleDialog&&<div className="dialog-backdrop"><section className="dialog"><h2>Create schedule</h2><label>Starting time<input type="time" value={startAt} onChange={e=>setStartAt(e.target.value)}/></label><label>Number of breaks<input type="number" value={breakCount} onChange={e=>setBreakCount(Number(e.target.value))}/></label><label>Finish time<input type="time" value={finishAt} onChange={e=>setFinishAt(e.target.value)}/></label><button onClick={()=>setScheduleDialog(false)}>Cancel</button><button onClick={generateSchedule}>Generate</button></section></div>}</main></div>
}
function TaskList({tasks,toggle,remove}:{tasks:Task[];toggle:(id:string)=>void;remove:(id:string)=>void}){return <div className="task-list">{tasks.map(t=><div className={`task-row ${t.done?'completed':''}`} key={t.id}><button className="check" onClick={()=>toggle(t.id)}>{t.done&&<Icon name="tasks"/>}</button><span className="task-name">{t.title}</span><span>{t.priority}</span><button className="delete" onClick={()=>remove(t.id)}><Icon name="close"/></button></div>)}</div>}
function AddTask({onAdd}:{onAdd:()=>void}){return <button className="create-task-button" onClick={onAdd}><Icon name="plus"/> Create task</button>}
export default App
