import { useEffect, useRef } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import type { Results } from '@mediapipe/selfie_segmentation';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationId: number;
    let selfieSegmentation: SelfieSegmentation | null = null;

    const init = async () => {
      // ステップ1: カメラのセットアップ
      if (!videoRef.current) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });

        const video = videoRef.current;
        video.srcObject = stream;

        // メタデータの読み込みを待つ
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
        });

        await video.play();
        console.log('✅ カメラ起動完了');
      } catch (err) {
        console.error('❌ カメラの起動に失敗しました', err);
        return;
      }

      // ステップ1: MediaPipeの初期化
      try {
        selfieSegmentation = new SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });

        selfieSegmentation.setOptions({
          modelSelection: 1, // 0: 一般モデル, 1: 風景モデル（より正確）
        });

        selfieSegmentation.onResults(onResults);
        console.log('✅ MediaPipe初期化完了');

        // フレームごとにMediaPipeに送信
        detect();
      } catch (err) {
        console.error('❌ MediaPipeの初期化に失敗しました', err);
      }
    };

    function onResults(results: Results) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // ステップ3: 輪郭線の抽出
      // 一時canvasでマスクのピクセルデータを取得
      const tempCanvas = document.createElement('canvas');
      const mask = results.segmentationMask;
      tempCanvas.width = mask.width;
      tempCanvas.height = mask.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.drawImage(mask, 0, 0);
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imageData.data;

      // 輪郭線を抽出（エッジ検出）
      const w = tempCanvas.width;
      const h = tempCanvas.height;
      const outline = new Uint8ClampedArray(data.length);

      const lineWidth = 3; // 線の太さ

      for (let y = lineWidth; y < h - lineWidth; y++) {
        for (let x = lineWidth; x < w - lineWidth; x++) {
          const i = (y * w + x) * 4;

          // 現在のピクセルが「人（明るい）」かどうか
          const current = data[i] > 128;

          if (current) {
            // 周囲をチェック（線の太さ分）
            let isBoundary = false;
            for (let dy = -lineWidth; dy <= lineWidth; dy++) {
              for (let dx = -lineWidth; dx <= lineWidth; dx++) {
                const ni = ((y + dy) * w + (x + dx)) * 4;
                if (data[ni] <= 128) {
                  isBoundary = true;
                  break;
                }
              }
              if (isBoundary) break;
            }

            // 境界なら白で描画
            if (isBoundary) {
              outline[i] = 255;
              outline[i + 1] = 255;
              outline[i + 2] = 255;
              outline[i + 3] = 255;
            }
          }
        }
      }

      // 黒背景
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 輪郭線を描画
      const outlineImageData = new ImageData(outline, w, h);
      tempCtx.putImageData(outlineImageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    }

    async function detect() {
      if (videoRef.current && selfieSegmentation) {
        await selfieSegmentation.send({ image: videoRef.current });
      }
      animationId = requestAnimationFrame(detect);
    }

    init();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (selfieSegmentation) {
        selfieSegmentation.close();
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', flexDirection: 'column', alignItems: 'center' }}>
      <video ref={videoRef} width={640} height={480} style={{ display: 'none' }} autoPlay muted />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{
          border: '2px solid black',
          backgroundColor: 'black',
          transform: 'scaleX(-1)', // 鏡モード
        }}
      />
    </div>
  );
};

export default App;
