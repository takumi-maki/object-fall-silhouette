import { useEffect, useRef } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import type { Results } from '@mediapipe/selfie_segmentation';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationId: number;
    let selfieSegmentation: SelfieSegmentation | null = null;

    // Canvasをウィンドウサイズに合わせる
    const resizeCanvas = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

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

      const w = tempCanvas.width;
      const h = tempCanvas.height;

      // ノイズ除去: モルフォロジー処理（クロージング = 膨張 → 収縮）
      const threshold = 128;
      const kernelSize = 5; // カーネルサイズ（大きいほど強力）

      // 二値化
      const binary = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) {
        binary[i] = data[i * 4] > threshold ? 1 : 0;
      }

      // 膨張（Dilation）: 小さい穴を埋める
      const dilated = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let maxVal = 0;
          for (let ky = -kernelSize; ky <= kernelSize; ky++) {
            for (let kx = -kernelSize; kx <= kernelSize; kx++) {
              const ny = y + ky;
              const nx = x + kx;
              if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                maxVal = Math.max(maxVal, binary[ny * w + nx]);
              }
            }
          }
          dilated[y * w + x] = maxVal;
        }
      }

      // 収縮（Erosion）: 元のサイズに戻しつつノイズ除去
      const eroded = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let minVal = 1;
          for (let ky = -kernelSize; ky <= kernelSize; ky++) {
            for (let kx = -kernelSize; kx <= kernelSize; kx++) {
              const ny = y + ky;
              const nx = x + kx;
              if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                minVal = Math.min(minVal, dilated[ny * w + nx]);
              }
            }
          }
          eroded[y * w + x] = minVal;
        }
      }

      // 処理済みデータを元に戻す
      for (let i = 0; i < w * h; i++) {
        const val = eroded[i] * 255;
        data[i * 4] = val;
        data[i * 4 + 1] = val;
        data[i * 4 + 2] = val;
      }

      // ステップ4: Bounding Boxの計算
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;

      // 人体が存在する最小の矩形を求める
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i] > 128) {
            // 人体ピクセル発見
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Canvas座標系にスケール
      const scaleX = canvas.width / w;
      const scaleY = canvas.height / h;
      const boundingBox = {
        x1: minX * scaleX,
        y1: minY * scaleY,
        x2: maxX * scaleX,
        y2: maxY * scaleY,
      };

      // 輪郭線を抽出（エッジ検出）
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

      // デバッグ: Bounding Boxを赤い枠で表示
      if (minX < w && minY < h) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(boundingBox.x1, boundingBox.y1, boundingBox.x2 - boundingBox.x1, boundingBox.y2 - boundingBox.y1);
        console.log('📦 Bounding Box:', boundingBox);
      }
    }

    async function detect() {
      if (videoRef.current && selfieSegmentation) {
        await selfieSegmentation.send({ image: videoRef.current });
      }
      animationId = requestAnimationFrame(detect);
    }

    init();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (selfieSegmentation) {
        selfieSegmentation.close();
      }
    };
  }, []);

  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', width: '100vw', height: '100vh' }}>
      <video ref={videoRef} width={640} height={480} style={{ display: 'none' }} autoPlay muted />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          backgroundColor: 'black',
          transform: 'scaleX(-1)', // 鏡モード
        }}
      />
    </div>
  );
};

export default App;
