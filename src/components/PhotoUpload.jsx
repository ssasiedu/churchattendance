import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { initials } from '../lib/utils'
import { Button } from './ui'

/** Uploads a picture to the "church" storage bucket and hands back its public URL */
export default function PhotoUpload({ value, onChange, name = '', folder = 'members', hint }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setError('That picture is larger than 5MB. Please choose a smaller one.')
    setBusy(true)
    setError(null)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('church').upload(path, file, { cacheControl: '3600', upsert: false })
    setBusy(false)
    if (error) return setError('Upload failed. Re-run schema.sql so the "church" storage bucket exists.')
    const { data } = supabase.storage.from('church').getPublicUrl(path)
    onChange(data.publicUrl)
  }

  return (
    <div className="flex items-center gap-4">
      {value
        ? <img src={value} alt="" className="size-20 shrink-0 rounded-full border border-slate-200 object-cover" />
        : <span className="grid size-20 shrink-0 place-items-center rounded-full bg-slate-100 font-display text-xl text-slate-500">
            {initials(name) || <Camera className="size-6" />}
          </span>}
      <div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => fileRef.current?.click()}>
            <Camera className="size-4" /> {value ? 'Change photo' : 'Add photo'}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              <Trash2 className="size-4 text-absent" />
            </Button>
          )}
        </div>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        {error && <p className="mt-1 text-xs text-absent">{error}</p>}
      </div>
    </div>
  )
}
