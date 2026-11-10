'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { X } from 'lucide-react'

/**
 * A full-screen camera view that reads a QR code and hands its text to onScan once.
 * Decoding happens on the phone (nothing is uploaded). The camera needs a secure
 * page (https) and the person's permission; when either is missing it says so and
 * the checker can type the code instead.
 */
export default function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    let lastTry = 0

    const tick = (time: number) => {
      if (stopped) return
      frame = requestAnimationFrame(tick)
      if (time - lastTry < 150) return // about 6 tries a second is plenty
      lastTry = time
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return
      // A smaller picture decodes faster and is still plenty for a ticket's QR code
      const scale = Math.min(1, 640 / video.videoWidth)
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
      if (found?.data) {
        stopped = true
        onScanRef.current(found.data)
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('The camera is not available on this page. Type the ticket code instead.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        const video = videoRef.current
        if (video) { video.srcObject = s; video.play().catch(() => {}) }
        frame = requestAnimationFrame(tick)
      })
      .catch((err: { name?: string }) => {
        setError(
          err?.name === 'NotAllowedError'
            ? 'The camera was blocked. Allow the camera for this site in your browser settings, or type the ticket code instead.'
            : 'Could not open the camera. Type the ticket code instead.'
        )
      })

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div role="dialog" aria-label="Scan a ticket" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'black', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', color: 'white' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>Scan the ticket's QR code</span>
        <button onClick={onClose} aria-label="Close the camera" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '10px', padding: '10px', cursor: 'pointer', display: 'flex' }}>
          <X size={20} />
        </button>
      </div>
      {error ? (
        <div style={{ margin: 'auto', padding: '0 28px', textAlign: 'center', color: 'white', fontSize: '15px', lineHeight: 1.6 }}>
          {error}
          <div>
            <button onClick={onClose} style={{ marginTop: '20px', background: '#C0392B', color: 'white', border: 'none', borderRadius: '10px', padding: '12px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Type the code instead
            </button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: '64%', maxWidth: '320px', aspectRatio: '1', transform: 'translate(-50%, -50%)', border: '3px solid rgba(94,214,138,0.9)', borderRadius: '18px', boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)' }} />
          <p style={{ position: 'absolute', bottom: '28px', left: 0, right: 0, textAlign: 'center', color: 'white', fontSize: '13px', padding: '0 24px' }}>
            Hold the phone steady, with the QR code inside the frame.
          </p>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
