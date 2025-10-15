from flask import Flask, send_file, jsonify, request
from roboflow import Roboflow
import cv2
import numpy as np
import base64
import io
from PIL import Image
import os

# --- 初始化 Flask 和 Roboflow 模型 ---
app = Flask(__name__)
model = None
model_classes = []

print("\n" + "=" * 60)
print("🎥 正在初始化 Roboflow 模型...")
try:
    # 建議將 API 金鑰設為環境變數，但此處為求簡單直接使用
    api_key = os.getenv("ROBOFLOW_API_KEY")
    if not api_key:
        raise ValueError("請先設定 ROBOFLOW_API_KEY 環境變數")

    rf = Roboflow(api_key=api_key)
    project = rf.workspace("bacteria-gplgh").project("my-first-project-0flvn")
    version = project.version("3")
    model = version.model
    classes_info = project.classes
    model_classes = list(classes_info.keys())

    if not model_classes:
        raise ValueError("無法從 Roboflow 獲取模型類別")

    print(f"✅ Roboflow 模型和 {len(model_classes)} 個類別載入成功。")
    print("=" * 60)

except Exception as e:
    print(f"❌ Roboflow 初始化失敗: {e}")
    print("   請檢查您的 API 金鑰和專案名稱是否正確。")
    print("   後端將在沒有 AI 模型的情況下運行。")
    print("=" * 60)


# --- 靜態檔案路由 ---
@app.route('/')
def index():
    return send_file('index.html')

@app.route('/style.css')
def style():
    return send_file('style.css')

@app.route('/script.js')
def script():
    return send_file('script.js')

# --- API 路由 ---

@app.route('/classes')
def get_classes():
    """提供模型類別列表給前端"""
    return jsonify(model_classes)

@app.route('/predict', methods=['POST'])
def predict():
    """接收前端傳來的圖片，執行預測並回傳結果"""
    if not model:
        return jsonify({"error": "Model not loaded"}), 500

    try:
        # 1. 接收並解碼圖片
        data = request.get_json()
        if 'image' not in data:
            return jsonify({"error": "No image data"}), 400
            
        image_data = data['image'].split(',')[1]
        img_bytes = base64.b64decode(image_data)
        
        pil_image = Image.open(io.BytesIO(img_bytes))
        frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

        # 2. 儲存臨時檔案以供模型預測
        temp_filename = 'temp_frame_for_prediction.jpg'
        cv2.imwrite(temp_filename, frame)

        # 3. 執行預測
        result = model.predict(temp_filename, confidence=40, overlap=30).json()
        predictions = result.get('predictions', [])

        # 4. 計算統計數據
        class_stats = {}
        for pred in predictions:
            class_name = pred['class']
            confidence = pred.get('confidence', 0) * 100
            
            if class_name not in class_stats:
                class_stats[class_name] = {'count': 0, 'confidences': []}
            
            class_stats[class_name]['count'] += 1
            class_stats[class_name]['confidences'].append(confidence)
        
        for class_name in class_stats:
            confidences = class_stats[class_name]['confidences']
            class_stats[class_name]['avg_confidence'] = sum(confidences) / len(confidences) if confidences else 0

        # 5. 回傳結果
        return jsonify({
            "predictions": predictions, # 用於繪製方框
            "stats": class_stats        # 用於更新右側列表
        })

    except Exception as e:
        print(f"❌ 預測時發生錯誤: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("🚀 伺服器啟動中...")
    print("📱 請在瀏覽器開啟: http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
