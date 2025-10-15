// 儲存從後端 API 取得的所有偵測類別名稱
let ALL_CLASSES = [];

// DOM 元素：Video 和 Canvas 元素的參考
let videoElement;      // <video> 元素，顯示攝像頭即時畫面
let overlayCanvas;     // 疊加在 video 上方的透明 canvas，用於繪製偵測框
let overlayCtx;        // overlayCanvas 的 2D 繪圖上下文
let captureCanvas;     // 隱藏的 canvas，用於擷取畫面並傳送到後端
let captureCtx;        // captureCanvas 的 2D 繪圖上下文

// 結果顯示相關 DOM 元素
let resultsList;       // 右側結果列表的容器
let statusText;        // 狀態文字（例如「偵測中」、「初始化中」）

// 控制偵測循環的變數
let updateInterval;    
let isDetecting = false; // 防止同時執行多個偵測請求的旗標
// 系統初始化
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 系統初始化...');
    // 取得所有 DOM 元素
    videoElement = document.getElementById('videoElement');    // 攝像頭畫面
    overlayCanvas = document.getElementById('overlayCanvas');  // 偵測框圖層
    overlayCtx = overlayCanvas.getContext('2d');              // Canvas 繪圖工具
    captureCanvas = document.getElementById('captureCanvas'); // 隱藏的截圖 Canvas
    captureCtx = captureCanvas.getContext('2d');             // 截圖繪圖工具
    resultsList = document.getElementById('resultsList');     // 結果列表容器
    statusText = document.getElementById('statusText');       // 狀態文字顯示

    //從後端 API 取得偵測類別清單
    try {
        // 發送 GET 請求到 /classes 端點
        const response = await fetch('/classes');
        ALL_CLASSES = await response.json();
        console.log('📋 已載入模型類別:', ALL_CLASSES);
        
        // 立即在右側顯示所有類別（初始值為 0%）
        initializeAllClasses();
        
    } catch (error) {
        // 如果 API 請求失敗，使用預設類別
        console.error('❌ 取得類別清單失敗:', error);
        
        ALL_CLASSES = [
            'RBC',                  // 紅血球
            'WBC',                  // 白血球
            'Candida',              // 念珠菌
            'Escherichia coli',     // 大腸桿菌
            'Epithelial Cells',     // 上皮細胞
            'SA',                   // 葡萄球菌
            'Klebsiella',           // 克雷伯氏菌
            'Urine Crystals'        // 尿結晶
        ];
        
        // 即使失敗，也要顯示預設類別
        initializeAllClasses();
    }

    // 啟動攝像頭
    await startCamera();
    
    console.log('✅ 系統初始化完成！');
});

// 啟動攝像頭（Windows 專用版本）
async function startCamera() {
    try {
        // 更新狀態文字，告知使用者正在請求權限
        statusText.textContent = '請求攝像頭權限...';
        
        // 請求瀏覽器存取攝像頭
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                // 理想解析度設定（瀏覽器會盡量滿足）
                width: { ideal: 1280 },   
                height: { ideal: 720 },   
                
                facingMode: 'environment'
            },
            audio: false  // 不需要麥克風（只要影像）
        });
        
        // 將攝像頭串流綁定到 <video> 元素
        videoElement.srcObject = stream;
        
        // 等待 video 元資料載入完成
        // 當影片準備好播放時觸發此事件
        videoElement.onloadedmetadata = () => {
            // 在 Console 顯示攝像頭的實際解析度
            console.log('📹 攝像頭解析度:', 
                videoElement.videoWidth, 'x', videoElement.videoHeight);
            // 設定 Canvas 尺寸與攝像頭畫面一致
    
            // 設定繪製偵測框的 Canvas 尺寸
            overlayCanvas.width = videoElement.videoWidth;
            overlayCanvas.height = videoElement.videoHeight;
            
            // 設定擷取畫面的 Canvas 尺寸
            captureCanvas.width = videoElement.videoWidth;
            captureCanvas.height = videoElement.videoHeight;
            
            // 更新狀態為「偵測中」
            statusText.textContent = '偵測中';
            
            // 開始定期偵測循環
            startDetection();
        };
        
    } catch (error) {
        // 錯誤處理：無法存取攝像頭
        console.error('❌ 無法存取攝像頭:', error);
        
        // 更新狀態文字
        statusText.textContent = '攝像頭錯誤';
        
        // ⭐ Windows 專用錯誤提示
        alert(
            '無法存取攝像頭，請確認：\n' +
            '1. 已允許瀏覽器使用攝像頭\n' +
            '2. 沒有其他程式佔用攝像頭'
        );
    }
}

// 🔄 開始定期偵測循環
function startDetection() {
    // 立即執行第一次偵測（不等待 2 秒）
    detectAndSend();
    
    // 設定定時器：每 2 秒執行一次偵測
    updateInterval = setInterval(detectAndSend, 2000);
}

// 擷取當前畫面並傳送到後端進行偵測
async function detectAndSend() {
    // 防止重複執行，如果上一次偵測還沒完成，直接跳過這次
    if (isDetecting) return;
    
    // 設定旗標為 true，表示「偵測進行中」
    isDetecting = true;
    
    try {
        // 將 video 當前畫面繪製到 Canvas
        captureCtx.drawImage(
            videoElement, 
            0, 0, 
            captureCanvas.width, 
            captureCanvas.height
        );
        
        // 將 Canvas 轉換成 JPEG 圖片（Blob 格式）
        const blob = await new Promise(resolve => {
            captureCanvas.toBlob(resolve, 'image/jpeg', 0.9);
        });
    
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');

        const response = await fetch('/detect', {
            method: 'POST',          
            body: formData           
        });
        
        const data = await response.json();
        
        // 根據後端回應更新畫面
        if (data.success) {
            // ✅ 偵測成功
            
            // 更新右側統計資料（百分比進度條）
            updateResultsData(data.predictions);
            
            // 在 video 上繪製綠色偵測框
            drawDetections(data.detections);
            
        } else {
            // ❌ 偵測失敗
            console.error('偵測失敗:', data.error);
        }
        
    } catch (error) {
        // 錯誤處理：網路問題、格式錯誤等
        console.error('❌ 偵測錯誤:', error);
        
    } finally {
        // 無論成功或失敗，都要重置旗標
        isDetecting = false;
    }
}

// 在 Canvas 上繪製 AI 偵測框
function drawDetections(detections) {
    // 清空 Canvas（移除上一次的偵測框）
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // 檢查是否有偵測結果
    // 如果沒有偵測到任何物體，直接返回（不繪製）
    if (!detections || detections.length === 0) return;
    
    // 遍歷每個偵測結果，繪製矩形框
    detections.forEach(det => {
        const x = det.x - det.width / 2;
        const y = det.y - det.height / 2;
        const w = det.width;
        const h = det.height;
        
        // 繪製綠色邊框
        overlayCtx.strokeStyle = '#00ff00';  // 設定邊框顏色為綠色
        overlayCtx.lineWidth = 3;            // 設定線條粗細為 3px
        overlayCtx.strokeRect(x, y, w, h);   // 繪製矩形邊框
        
        // 準備標籤文字（類別名稱 + 信心度）
        // 將信心度從小數轉換成百分比（0.85 → 85%）
        const confidence = (det.confidence * 100).toFixed(0);
        
        // 組合標籤文字
        // 例如：「RBC: 87%」
        const label = `${det.class}: ${confidence}%`;
        
        // 計算文字寬度（用於繪製背景矩形）
        const textWidth = overlayCtx.measureText(label).width;
        
        // 繪製標籤背景（綠色矩形）
        overlayCtx.fillStyle = '#00ff00';  // 設定填滿顏色為綠色
        
        overlayCtx.fillRect(
            x,                 
            y - 25,             
            textWidth + 10,    
            25                
        );
        
        // 繪製標籤文字（黑色）
        overlayCtx.fillStyle = '#000000';        // 設定文字顏色為黑色
        overlayCtx.font = 'bold 16px Arial';     // 設定字體（粗體、16px、Arial）
        overlayCtx.fillText(
            label,      
            x + 5,      
            y - 7       
        );
    });
}

// 初始化顯示所有類別（系統啟動時執行一次）
function initializeAllClasses() {
    // 清空右側結果列表（移除「載入中」的提示）
    resultsList.innerHTML = '';
    
    // 為每個類別建立一個「結果項目」
    ALL_CLASSES.forEach(className => {
        // 建立 HTML 元素（初始值為 0%，灰色顯示）
        const resultItem = createResultItem(className, null);
        
        // 加入到結果列表容器中
        resultsList.appendChild(resultItem);
    });
}


// 更新結果數據（每次偵測後執行）
function updateResultsData(predictionsData) {
    // 遍歷所有類別，更新對應的進度條
    ALL_CLASSES.forEach((className, index) => {
        // 從後端資料中取得該類別的統計資料
        const stats = predictionsData[className] || null;
        
        // 取得對應的 DOM 元素
        const resultItem = resultsList.children[index];
        
        // 防呆：如果元素不存在，跳過
        if (!resultItem) return;
        
        // 取得需要更新的子元素
        // 百分比文字元素（例如「87%」）
        const percentageSpan = resultItem.querySelector('.percentage');
        
        // 進度條填滿元素（藍色漸層條）
        const progressFill = resultItem.querySelector('.progress-fill');
        
        // 情況 1：有偵測到該類別
        if (stats) {
            // 計算平均信心度（四捨五入到整數）
            const avgConf = stats.avg_confidence.toFixed(0);
            
            // 移除「未偵測」的灰色樣式
            // CSS 中 .not-detected 會將 opacity 設為 0.4
            resultItem.classList.remove('not-detected');
            
            // 更新百分比文字（例如「86%」）
            if (percentageSpan) {
                percentageSpan.textContent = avgConf + '%';
            }
            
            // 更新進度條寬度（觸發 CSS 過渡動畫）
            if (progressFill) {
                progressFill.style.width = avgConf + '%';
            }
            
        // 情況 2：沒有偵測到該類別
        } else {
            // 加上「未偵測」的灰色樣式
            // 視覺效果：整個項目變半透明（opacity: 0.4）
            resultItem.classList.add('not-detected');
            
            // 重置百分比文字為 0%
            if (percentageSpan) {
                percentageSpan.textContent = '0%';
            }
            
            // 重置進度條寬度為 0
            if (progressFill) {
                progressFill.style.width = '0%';
            }
        }
    });
}


// 建立結果項目的 HTML 結構
function createResultItem(className, stats) {
    // 建立外層 div 容器
    const div = document.createElement('div');
    div.className = 'result-item';  // 加入 CSS 類別
    
    // 如果沒有統計資料（初始狀態），預設為「未偵測」
    if (!stats) {
        div.classList.add('not-detected');
    }
    
    // 計算顯示的信心度（沒有資料時顯示 0）
    const avgConf = stats ? stats.avg_confidence.toFixed(0) : '0';
    
    // 使用模板字串建立 HTML 結構
    div.innerHTML = `
        <!-- 類別名稱標題 -->
        <div class="result-header">
            <span class="class-name">${className}</span>
        </div>
        
        <!-- 進度條容器 -->
        <div class="progress-container">
            <!-- 百分比標籤 -->
            <div class="progress-label">
                <span></span>  <!-- 左側空白（預留空間） -->
                <span class="percentage">${avgConf}%</span>  <!-- 右側顯示百分比 -->
            </div>
            
            <!-- 進度條 -->
            <div class="progress-bar">
                <!-- 進度填滿（藍色漸層） -->
                <div class="progress-fill" style="width: ${avgConf}%;"></div>
            </div>
        </div>
    `;
    
    // 返回建立好的 DOM 元素
    return div;
}

// 頁面可見性改變時的處理
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // 頁面被隱藏：停止偵測循環
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        
    } else {
        // 頁面重新顯示：恢復偵測循環
        startDetection();
    }
});

window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    // 釋放攝像頭資源
    if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
         // 逐一停止每個軌道
        tracks.forEach(track => track.stop());
    }
});
