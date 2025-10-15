// 儲存從伺服器取得的所有類別
let ALL_CLASSES = [];
document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const resultsList = document.getElementById('resultsList');
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');
    const ctx = overlay.getContext('2d');

    // 1. 啟動攝影機
    async function setupCamera() {
        try {
            statusText.textContent = '請求攝影機權限...';
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                // 調整 canvas 尺寸以匹配視訊
                overlay.width = video.videoWidth;
                overlay.height = video.videoHeight;
                
                // 獲取模型類別並開始偵測
                fetchClassesAndStart();
            };
        } catch (err) {
            console.error("無法存取攝影機:", err);
            statusText.textContent = '攝影機存取失敗';
            alert("無法存取攝影機。請檢查瀏覽器權限並重新整理頁面。");
        }
    }

    // 2. 獲取類別，然後啟動偵測循環
    async function fetchClassesAndStart() {
        try {
            const response = await fetch('/classes');
            ALL_CLASSES = await response.json();
            if (ALL_CLASSES.length === 0) throw new Error("模型類別為空");
            
            initializeAllClasses(); // 初始化右側列表
            statusText.textContent = '偵測中';
            
            // 每 1 秒傳送一次畫面進行偵測
            setInterval(predictFrame, 1000);

        } catch (error) {
            console.error('取得類別清單失敗:', error);
            resultsList.innerHTML = `<div class="empty-state"><p>無法載入模型</p></div>`;
            statusText.textContent = '模型載入失敗';
        }
    }

    // 3. 傳送畫面到後端並處理回傳結果
    async function predictFrame() {
        // 將影片畫面畫到一個暫存 canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

        // 將 canvas 轉為 Base64 格式的圖片數據
        const imageData = tempCanvas.toDataURL('image/jpeg', 0.8);

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData }),
            });

            if (!response.ok) throw new Error(`伺服器錯誤: ${response.status}`);
            
            const result = await response.json();
            
            // 繪製偵測框
            drawOverlay(result.predictions);
            // 更新右側統計數據
            updateResultsData(result.stats);

        } catch (error) {
            console.error('預測失敗:', error);
            statusDot.style.background = '#ef4444'; // 紅色
        }
    }

    // 在 overlay canvas 上繪製方框
    function drawOverlay(predictions) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (!predictions) return;

        predictions.forEach(pred => {
            const x = pred.x - pred.width / 2;
            const y = pred.y - pred.height / 2;
            const w = pred.width;
            const h = pred.height;

            ctx.strokeStyle = '#34d399'; // 綠色
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 18px Arial';
            const label = `${pred.class} ${Math.round(pred.confidence * 100)}%`;
            ctx.fillText(label, x, y > 20 ? y - 8 : 20);
        });
    }

    // 初始化右側結果列表
    function initializeAllClasses() {
        resultsList.innerHTML = '';
        ALL_CLASSES.forEach(className => {
            const resultItem = createResultItem(className, null);
            resultsList.appendChild(resultItem);
        });
    }

    // 更新右側列表的數據
    function updateResultsData(detectedData) {
        ALL_CLASSES.forEach((className, index) => {
            const stats = detectedData[className] || null;
            const resultItem = resultsList.children[index];
            if (!resultItem) return;

            const percentageSpan = resultItem.querySelector('.percentage');
            const progressFill = resultItem.querySelector('.progress-fill');

            if (stats) {
                const avgConf = stats.avg_confidence.toFixed(0);
                resultItem.classList.remove('not-detected');
                if (percentageSpan) percentageSpan.textContent = avgConf + '%';
                if (progressFill) progressFill.style.width = avgConf + '%';
            } else {
                resultItem.classList.add('not-detected');
                if (percentageSpan) percentageSpan.textContent = '0%';
                if (progressFill) progressFill.style.width = '0%';
            }
        });
    }

    // 建立單個結果項目的 HTML 結構
    function createResultItem(className, stats) {
        const div = document.createElement('div');
        div.className = 'result-item not-detected';
        const avgConf = stats ? stats.avg_confidence.toFixed(0) : '0';
        div.innerHTML = `
            <div class="result-header">
                <span class="class-name">${className}</span>
            </div>
            <div class="progress-container">
                <div class="progress-label">
                    <span></span>
                    <span class="percentage">${avgConf}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${avgConf}%;"></div>
                </div>
            </div>
        `;
        return div;
    }

    // 啟動！
    setupCamera();
});
