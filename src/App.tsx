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

    // ステップ8: 輪郭線データを保存する変数
    let outlineData: Uint8ClampedArray | null = null;
    let outlineWidth = 0;
    let outlineHeight = 0;

    // ステップ5: 星の形を作成
    const createStarPath = (size: number): Path2D => {
      const path = new Path2D();
      const spikes = 5;
      const outerRadius = size;
      const innerRadius = size / 2;

      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        if (i === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      path.closePath();
      return path;
    };

    const starPath = createStarPath(20); // 星のサイズ20px

    // 星の数を増やす: 複数の星を管理
    interface Star {
      x: number;
      y: number;
      velocityX: number;
      velocityY: number;
    }

    const stars: Star[] = [];
    const STAR_COUNT = 200; // 50 → 200 に増やす

    // 重力定数
    const GRAVITY = 0.3; // 重力加速度
    const BOUNCE_VELOCITY = -10; // 跳ね返り時の初速度（上向き）

    // 星の初期位置を設定
    const createStar = (): Star => {
      if (!canvasRef.current) return { x: 0, y: 0, velocityX: 0, velocityY: 0 };
      return {
        x: Math.random() * canvasRef.current.width,
        y: -50 - Math.random() * 500, // ランダムな高さから開始
        velocityX: 0, // 横方向の初速度0
        velocityY: 0, // 縦方向の初速度0（重力で加速）
      };
    };

    // 200個の星を初期化
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push(createStar());
    }

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
      const threshold = 180; // 128 → 180 に上げてノイズを除去
      const kernelSize = 2; // カーネルサイズ（軽量化）

      // 二値化（閾値を上げて小さいノイズを切り捨て）
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

      // ステップ8: 輪郭線データを保存
      outlineData = outline;
      outlineWidth = w;
      outlineHeight = h;

      // カメラ映像を背景として描画
      const video = videoRef.current;
      if (video) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // 輪郭線を描画
      const outlineImageData = new ImageData(outline, w, h);
      tempCtx.putImageData(outlineImageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);

      // 複数の星を処理
      stars.forEach((star) => {
        // ステップ9: 輪郭線との衝突判定
        let isColliding = false;

        if (outlineData && outlineWidth > 0 && outlineHeight > 0) {
          // 星の座標を輪郭線データの座標に変換
          const outlineX = Math.floor((star.x / canvas.width) * outlineWidth);
          const outlineY = Math.floor((star.y / canvas.height) * outlineHeight);

          // 範囲チェック
          if (outlineX >= 0 && outlineX < outlineWidth && outlineY >= 0 && outlineY < outlineHeight) {
            // その位置が輪郭線かどうかチェック
            const index = (outlineY * outlineWidth + outlineX) * 4;
            isColliding = outlineData[index] > 0; // 輪郭線は白（255）
          }
        }

        if (isColliding && star.velocityY > 0) {
          // バウンド（跳ね返り）: 上向きの初速度を与える
          star.velocityY = BOUNCE_VELOCITY;
          // 横方向にもランダムな速度を与える（-3 〜 3）
          star.velocityX = (Math.random() - 0.5) * 6;
        }

        // 重力を適用
        star.velocityY += GRAVITY;

        // ステップ6: 星を動かす
        star.x += star.velocityX;
        star.y += star.velocityY;

        // 画面下に到達したら上に戻す
        if (star.y > canvas.height + 50) {
          star.x = Math.random() * canvas.width;
          star.y = -50;
          star.velocityX = 0;
          star.velocityY = 0;
        }

        // 画面上に行きすぎたら上に戻す
        if (star.y < -100) {
          star.x = Math.random() * canvas.width;
          star.y = -50;
          star.velocityX = 0;
          star.velocityY = 0;
        }

        // 画面左右に出たら戻す
        if (star.x < -50 || star.x > canvas.width + 50) {
          star.x = Math.random() * canvas.width;
          star.y = -50;
          star.velocityX = 0;
          star.velocityY = 0;
        }

        // 星を描画
        ctx.save();
        ctx.translate(star.x, star.y);
        ctx.fillStyle = 'yellow';
        ctx.fill(starPath);
        ctx.restore();
      });
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
