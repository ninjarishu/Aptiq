export type Sound = 'click'|'success'|'open'|'close'|'create'|'complete'|'delete'|'schedule'|'start'|'pause'|'resume'|'finish'|'preview'
export type AudioPrefs = { enabled:boolean; volume:number; focus:boolean }
const defaults:AudioPrefs={enabled:true,volume:.45,focus:true}
let context:AudioContext|undefined
let lastSound=''
let lastAt=0
export function readAudioPrefs():AudioPrefs { try{return {...defaults,...JSON.parse(localStorage.getItem('aptiq-audio')||'{}')}}catch{return defaults} }
export function saveAudioPrefs(prefs:AudioPrefs){localStorage.setItem('aptiq-audio',JSON.stringify(prefs))}
export function playSound(sound:Sound,prefs=readAudioPrefs()){
 if(!prefs.enabled || (['start','pause','resume','finish'].includes(sound)&&!prefs.focus))return
 const now=performance.now(); if(lastSound===sound&&now-lastAt<120)return; lastSound=sound;lastAt=now
 try {
  context ??= new AudioContext(); if(context.state==='suspended') void context.resume()
  const tones:Record<Sound,number[]>={click:[380],success:[520,660],open:[440],close:[392,330],create:[523,659],complete:[523,659],delete:[330],schedule:[440,554,659],start:[523],pause:[440,370],resume:[494,587],finish:[440,554,659],preview:[523,659]}
  const osc=context.createOscillator(), gain=context.createGain(), start=context.currentTime
  osc.type=sound==='click'?'triangle':'sine'; osc.frequency.setValueAtTime(tones[sound][0],start)
  if(tones[sound].length>1) for(let i=1;i<tones[sound].length;i++)osc.frequency.setValueAtTime(tones[sound][i],start+i*.085)
  gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(.11*prefs.volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+tones[sound].length*.085+.09)
  osc.connect(gain);gain.connect(context.destination);osc.start(start);osc.stop(start+tones[sound].length*.085+.1)
 }catch{/* Audio is optional; user action remains successful if unavailable. */}
}
