class AudioCutter {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.sourceNode = null;
        this.previewSourceNode = null;
        this.isPlaying = false;
        this.isPreviewing = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.isSelecting = false;
        this.originalFileName = '';
        this.isResizing = false;
        this.isDrawing = false;
        this.listenersAdded = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeAudioContext();
    }

    initializeElements() {
        // DOM elements
        this.uploadArea = document.getElementById('uploadArea');
        this.audioInput = document.getElementById('audioInput');
        this.audioSection = document.getElementById('audioSection');
        this.fileName = document.getElementById('fileName');
        this.duration = document.getElementById('duration');
        this.fileSize = document.getElementById('fileSize');
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.selectionOverlay = document.getElementById('selectionOverlay');
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.startTimeInput = document.getElementById('startTime');
        this.endTimeInput = document.getElementById('endTime');
        this.previewBtn = document.getElementById('previewBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        this.canvasCtx = this.waveformCanvas.getContext('2d');
    }

    async initializeAudioContext() {
        try {
            // AudioContext 생성
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 브라우저에서 AudioContext가 suspended 상태일 수 있음 (자동재생 정책)
            if (this.audioContext.state === 'suspended') {
                console.log('AudioContext가 일시중단 상태입니다. 사용자 상호작용 후 재개됩니다.');
            }
        } catch (error) {
            console.error('Web Audio API is not supported:', error);
            alert('죄송합니다. 이 브라우저는 오디오 처리를 지원하지 않습니다.');
        }
    }

    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('AudioContext가 재개되었습니다.');
            } catch (error) {
                console.error('AudioContext 재개 실패:', error);
            }
        }
    }

    async ensureAudioContextActive() {
        try {
            // AudioContext가 없으면 생성
            if (!this.audioContext) {
                await this.initializeAudioContext();
            }
            
            // suspended 상태면 재개
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('AudioContext 활성화됨');
            }
            
            return true;
        } catch (error) {
            console.error('AudioContext 활성화 실패:', error);
            return false;
        }
    }

    setupEventListeners() {
        // 중복 등록 방지
        if (this.listenersAdded) return;
        this.listenersAdded = true;
        
        // File upload
        this.audioInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Playback controls
        this.playBtn.addEventListener('click', () => this.playAudio());
        this.pauseBtn.addEventListener('click', () => this.pauseAudio());
        this.stopBtn.addEventListener('click', () => this.stopAudio());
        
        // Canvas selection - 향상된 마우스 인터랙션
        this.waveformCanvas.addEventListener('mousedown', (e) => this.startSelection(e));
        this.waveformCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.waveformCanvas.addEventListener('mouseup', (e) => this.endSelection(e));
        this.waveformCanvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
        
        // 터치 이벤트 지원 (모바일)
        this.waveformCanvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.waveformCanvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.waveformCanvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Time inputs
        this.startTimeInput.addEventListener('input', () => this.updateSelectionFromInputs());
        this.endTimeInput.addEventListener('input', () => this.updateSelectionFromInputs());
        
        // Action buttons
        this.previewBtn.addEventListener('click', () => this.previewSelection());
        this.downloadBtn.addEventListener('click', () => this.downloadSelection());
        
        // Canvas resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    async handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // 사용자 상호작용으로 AudioContext 활성화
            await this.ensureAudioContextActive();
            this.processFile(files[0]);
        }
    }

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            // 사용자 상호작용으로 AudioContext 활성화
            await this.ensureAudioContextActive();
            this.processFile(file);
        }
    }

    async processFile(file) {
        // 파일 타입 확인
        const supportedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac', 'audio/ogg'];
        const isSupported = supportedTypes.some(type => file.type === type) || file.type.startsWith('audio/');
        
        if (!isSupported) {
            alert(`지원하지 않는 파일 형식입니다.\n지원 형식: MP3, WAV, M4A, AAC, OGG\n업로드한 파일: ${file.type || '알 수 없음'}`);
            return;
        }

        // 파일 크기 확인 (100MB 제한)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            alert('파일 크기가 너무 큽니다. 100MB 이하의 파일을 업로드해주세요.');
            return;
        }

        this.originalFileName = file.name;
        console.log(`파일 처리 시작: ${file.name} (${file.type}, ${this.formatFileSize(file.size)})`);
        
        this.showProgress('파일을 로딩 중...');

        try {
            // AudioContext 상태 확인 및 재개
            await this.resumeAudioContext();
            
            if (!this.audioContext) {
                throw new Error('AudioContext가 초기화되지 않았습니다.');
            }

            this.updateProgress('파일을 읽는 중...', 20);
            const arrayBuffer = await file.arrayBuffer();
            
            this.updateProgress('오디오 데이터를 디코딩 중...', 60);
            
            // 디코딩 시도
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice());
            
            console.log(`오디오 디코딩 성공: ${this.audioBuffer.duration.toFixed(2)}초, ${this.audioBuffer.sampleRate}Hz`);
            
            this.updateProgress('파형을 생성 중...', 80);
            
            this.displayAudioInfo(file);
            this.drawWaveform();
            this.showAudioSection();
            
            // Initialize selection to full audio
            this.selectionStart = 0;
            this.selectionEnd = this.audioBuffer.duration;
            this.updateTimeInputs();
            this.updatePreviewButton();
            
            // 초기 파형 그리기
            requestAnimationFrame(() => this.redrawWaveform());
            
            this.updateProgress('완료!', 100);
            
            setTimeout(() => {
                this.hideProgress();
            }, 500);
            
        } catch (error) {
            console.error('오디오 파일 처리 오류:', error);
            
            let errorMessage = '오디오 파일을 처리하는 중 오류가 발생했습니다.\n\n';
            
            if (error.name === 'EncodingError' || error.message.includes('decode')) {
                errorMessage += '파일이 손상되었거나 지원하지 않는 오디오 형식입니다.\n다른 파일을 시도해보세요.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage += '이 브라우저에서 지원하지 않는 오디오 형식입니다.';
            } else if (error.message.includes('AudioContext')) {
                errorMessage += '오디오 시스템 초기화에 실패했습니다.\n페이지를 새로고침해보세요.';
            } else {
                errorMessage += `오류 상세: ${error.message}`;
            }
            
            alert(errorMessage);
            this.hideProgress();
        }
    }

    updateProgress(text, percentage) {
        this.progressText.textContent = text;
        this.progressFill.style.width = percentage + '%';
    }

    displayAudioInfo(file) {
        this.fileName.textContent = file.name;
        this.duration.textContent = this.formatTime(this.audioBuffer.duration);
        this.fileSize.textContent = this.formatFileSize(file.size);
    }

    drawWaveform() {
        if (this.isDrawing || !this.audioBuffer) return;
        this.isDrawing = true;
        
        // 초기 설정 시에만 캔버스 크기 조정
        if (!this.waveformCanvas.width || !this.waveformCanvas.height) {
            this.resizeCanvas();
        }
        
        // 실제 표시 크기 기준으로 계산 (고해상도 대응)
        const container = this.waveformCanvas.parentElement;
        const displayWidth = container.clientWidth;
        const displayHeight = container.clientHeight;
        const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 2); // 최소 2배 해상도
        
        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / displayWidth);
        const amp = displayHeight / 2;

        // 캔버스 클리어 (고해상도 크기)
        this.canvasCtx.clearRect(0, 0, displayWidth, displayHeight);
        this.canvasCtx.fillStyle = '#f8f9fa';
        this.canvasCtx.fillRect(0, 0, displayWidth, displayHeight);

        // 부드러운 파형을 위한 데이터 전처리
        const waveformData = this.preprocessWaveformData(data, displayWidth);
        
        // 파형 그리기 설정 (부드러운 렌더링)
        this.canvasCtx.save();
        this.canvasCtx.strokeStyle = '#667eea';
        this.canvasCtx.lineWidth = 1.2 / devicePixelRatio;
        this.canvasCtx.lineCap = 'round';
        this.canvasCtx.lineJoin = 'round';
        
        // 최고 품질 안티앨리어싱
        this.canvasCtx.imageSmoothingEnabled = true;
        this.canvasCtx.imageSmoothingQuality = 'high';
        
        // 부드러운 파형 그리기 (곡선 보간)
        this.drawSmoothWaveform(waveformData, displayWidth, amp);
        
        this.canvasCtx.stroke();
        this.canvasCtx.restore();
        this.updateSelectionOverlay();
        this.isDrawing = false;
    }

    // 파형 데이터 전처리 (부드러운 렌더링을 위한)
    preprocessWaveformData(audioData, width) {
        const waveData = [];
        const samplesPerPixel = audioData.length / width;
        
        for (let i = 0; i < width; i++) {
            const startSample = Math.floor(i * samplesPerPixel);
            const endSample = Math.floor((i + 1) * samplesPerPixel);
            
            let min = 0, max = 0, rms = 0;
            let count = 0;
            
            // RMS와 Peak 값 계산
            for (let j = startSample; j < endSample && j < audioData.length; j++) {
                const sample = audioData[j];
                min = Math.min(min, sample);
                max = Math.max(max, sample);
                rms += sample * sample;
                count++;
            }
            
            if (count > 0) {
                rms = Math.sqrt(rms / count) * 0.7; // RMS 값으로 부드러운 표현
            }
            
            // 부드러운 전환을 위한 가중평균
            if (i > 0 && i < width - 1) {
                const prevData = waveData[i - 1];
                if (prevData) {
                    min = min * 0.7 + prevData.min * 0.3;
                    max = max * 0.7 + prevData.max * 0.3;
                }
            }
            
            waveData.push({ min, max, rms, x: i });
        }
        
        return waveData;
    }

    // 부드러운 파형 그리기 (베지어 곡선 사용)
    drawSmoothWaveform(waveData, width, amplitude) {
        if (waveData.length < 2) return;
        
        // 상단 곡선 (최대값)
        this.canvasCtx.beginPath();
        const topY = (x) => amplitude + waveData[x].max * amplitude;
        
        this.canvasCtx.moveTo(0, topY(0));
        
        for (let i = 1; i < waveData.length - 1; i++) {
            const x = i;
            const y = topY(i);
            const nextX = i + 1;
            const nextY = topY(i + 1);
            
            // 베지어 곡선으로 부드럽게 연결
            const cpX = (x + nextX) / 2;
            this.canvasCtx.quadraticCurveTo(x, y, cpX, (y + nextY) / 2);
        }
        this.canvasCtx.lineTo(width - 1, topY(waveData.length - 1));
        
        // 하단 곡선 (최소값) - 역순으로
        const bottomY = (x) => amplitude + waveData[x].min * amplitude;
        
        this.canvasCtx.lineTo(width - 1, bottomY(waveData.length - 1));
        
        for (let i = waveData.length - 2; i > 0; i--) {
            const x = i;
            const y = bottomY(i);
            const prevX = i - 1;
            const prevY = bottomY(i - 1);
            
            const cpX = (x + prevX) / 2;
            this.canvasCtx.quadraticCurveTo(x, y, cpX, (y + prevY) / 2);
        }
        this.canvasCtx.lineTo(0, bottomY(0));
        this.canvasCtx.closePath();
        
        // 그라데이션 배경
        const gradient = this.canvasCtx.createLinearGradient(0, 0, 0, amplitude * 2);
        gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
        gradient.addColorStop(0.5, 'rgba(102, 126, 234, 0.1)');
        gradient.addColorStop(1, 'rgba(102, 126, 234, 0.3)');
        
        this.canvasCtx.fillStyle = gradient;
        this.canvasCtx.fill();
        
        // 외곽선
        this.canvasCtx.stroke();
    }

    drawWaveformWithSelection() {
        if (this.isDrawing || !this.audioBuffer) return;
        this.isDrawing = true;
        
        // 실제 표시 크기 기준으로 계산 (고해상도 대응)
        const container = this.waveformCanvas.parentElement;
        const displayWidth = container.clientWidth;
        const displayHeight = container.clientHeight;
        const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 2); // 최소 2배 해상도
        
        const data = this.audioBuffer.getChannelData(0);
        const amp = displayHeight / 2;

        // 배경 클리어
        this.canvasCtx.clearRect(0, 0, displayWidth, displayHeight);
        this.canvasCtx.fillStyle = '#f8f9fa';
        this.canvasCtx.fillRect(0, 0, displayWidth, displayHeight);

        // 선택 구간 계산
        const startPixel = (this.selectionStart / this.audioBuffer.duration) * displayWidth;
        const endPixel = (this.selectionEnd / this.audioBuffer.duration) * displayWidth;

        // 부드러운 파형을 위한 데이터 전처리
        const waveformData = this.preprocessWaveformData(data, displayWidth);
        
        // 안티앨리어싱 설정
        this.canvasCtx.imageSmoothingEnabled = true;
        this.canvasCtx.imageSmoothingQuality = 'high';
        
        // 선택되지 않은 구간 (흐릿하게)
        this.canvasCtx.save();
        this.canvasCtx.strokeStyle = '#d0d0d0';
        this.canvasCtx.lineWidth = 0.8 / devicePixelRatio;
        this.canvasCtx.globalAlpha = 0.4;
        this.canvasCtx.lineCap = 'round';
        this.canvasCtx.lineJoin = 'round';
        
        // 선택되지 않은 부분을 마스크로 그리기
        this.canvasCtx.beginPath();
        this.canvasCtx.rect(0, 0, startPixel, displayHeight);
        this.canvasCtx.rect(endPixel, 0, displayWidth - endPixel, displayHeight);
        this.canvasCtx.clip();
        
        this.drawSmoothWaveform(waveformData, displayWidth, amp);
        this.canvasCtx.restore();

        // 선택된 구간 (강조) - 부드러운 렌더링
        this.canvasCtx.save();
        this.canvasCtx.strokeStyle = '#667eea';
        this.canvasCtx.lineWidth = 1.2 / devicePixelRatio;
        this.canvasCtx.globalAlpha = 1.0;
        this.canvasCtx.lineCap = 'round';
        this.canvasCtx.lineJoin = 'round';
        
        // 선택된 부분만 클리핑
        this.canvasCtx.beginPath();
        this.canvasCtx.rect(startPixel, 0, endPixel - startPixel, displayHeight);
        this.canvasCtx.clip();
        
        this.drawSmoothWaveform(waveformData, displayWidth, amp);
        this.canvasCtx.restore();

        // 선택 구간 경계선
        this.canvasCtx.strokeStyle = '#4a90e2';
        this.canvasCtx.lineWidth = 1.5 / devicePixelRatio; // 경계선도 더 세밀하게
        this.canvasCtx.setLineDash([4 / devicePixelRatio, 2 / devicePixelRatio]); // 더 세밀한 점선
        this.canvasCtx.lineCap = 'round';
        
        // 시작선
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(startPixel, 0);
        this.canvasCtx.lineTo(startPixel, displayHeight);
        this.canvasCtx.stroke();
        
        // 종료선
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(endPixel, 0);
        this.canvasCtx.lineTo(endPixel, displayHeight);
        this.canvasCtx.stroke();
        
        this.canvasCtx.setLineDash([]); // 점선 초기화

        // 선택 구간 시간 표시 (컴팩트 크기에 최적화)
        this.canvasCtx.fillStyle = '#4a90e2';
        this.canvasCtx.font = `${Math.round(10 / devicePixelRatio)}px Arial`; // 더 작은 폰트
        this.canvasCtx.textAlign = 'center';
        this.canvasCtx.shadowColor = 'rgba(255,255,255,0.9)';
        this.canvasCtx.shadowBlur = 1.5 / devicePixelRatio;
        
        const startTime = this.formatTime(this.selectionStart);
        const endTime = this.formatTime(this.selectionEnd);
        
        // 텍스트 위치를 화면 크기에 맞게 조정
        const textY = Math.min(15, displayHeight * 0.15); // 화면 높이의 15% 또는 최대 15px
        
        if (startPixel > 25) { // 여백 줄임
            this.canvasCtx.fillText(startTime, startPixel, textY);
        }
        if (endPixel < displayWidth - 25) { // 여백 줄임
            this.canvasCtx.fillText(endTime, endPixel, textY);
        }
        
        // 그림자 효과 초기화
        this.canvasCtx.shadowBlur = 0;

        this.updateSelectionOverlay();
        this.isDrawing = false;
    }

    // 통합된 파형 다시 그리기 함수 (무한 호출 방지)
    redrawWaveform() {
        if (this.isDrawing || !this.audioBuffer) return;
        
        // 선택 구간이 있으면 선택과 함께, 없으면 기본 파형 그리기
        if (this.selectionStart !== this.selectionEnd && 
            (this.selectionStart > 0 || this.selectionEnd < this.audioBuffer.duration)) {
            this.drawWaveformWithSelection();
        } else {
            this.drawWaveform();
        }
    }

    resizeCanvas() {
        const container = this.waveformCanvas.parentElement;
        const displayWidth = container.clientWidth;
        const displayHeight = container.clientHeight;
        
        // 고해상도 디스플레이 지원 (레티나, 4K 등) - 더 높은 해상도
        const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 2); // 최소 2배 해상도
        const canvasWidth = displayWidth * devicePixelRatio;
        const canvasHeight = displayHeight * devicePixelRatio;
        
        // 실제 캔버스 크기가 변경된 경우에만 다시 설정
        if (this.waveformCanvas.width !== canvasWidth || this.waveformCanvas.height !== canvasHeight) {
            // 실제 캔버스 픽셀 크기 설정 (고해상도)
            this.waveformCanvas.width = canvasWidth;
            this.waveformCanvas.height = canvasHeight;
            
            // CSS 표시 크기 설정
            this.waveformCanvas.style.width = displayWidth + 'px';
            this.waveformCanvas.style.height = displayHeight + 'px';
            
            // 컨텍스트 스케일링 적용 (누적 방지를 위해 리셋 후 적용)
            this.canvasCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
            
            console.log(`캔버스 해상도 설정: ${canvasWidth}×${canvasHeight} (픽셀비율: ${devicePixelRatio})`);
            
            // 리사이즈 후 파형 다시 그리기 (무한 호출 방지)
            if (this.audioBuffer && !this.isResizing) {
                this.isResizing = true;
                setTimeout(() => {
                    this.redrawWaveform();
                    this.isResizing = false;
                }, 0);
            }
        }
    }

    startSelection(e) {
        if (!this.audioBuffer) return;
        
        e.preventDefault();
        this.isSelecting = true;
        this.waveformCanvas.style.cursor = 'crosshair';
        
        const rect = this.waveformCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / rect.width) * this.audioBuffer.duration;
        
        this.selectionStart = Math.max(0, Math.min(time, this.audioBuffer.duration));
        this.selectionEnd = this.selectionStart;
        this.initialSelectionStart = this.selectionStart;
        
        this.updateSelectionOverlay();
        this.updateTimeInputs();
        this.updatePreviewButton();
        
        // 선택 시작 시에만 파형 업데이트 (실시간 드래그 중에는 성능상 스킵)
        if (!this.isDrawing) {
            requestAnimationFrame(() => this.redrawWaveform());
        }
    }

    updateSelection(e) {
        if (!this.isSelecting || !this.audioBuffer) return;
        
        e.preventDefault();
        const rect = this.waveformCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const time = (x / rect.width) * this.audioBuffer.duration;
        
        this.selectionEnd = Math.max(0, Math.min(time, this.audioBuffer.duration));
        
        // 드래그 방향에 따라 start와 end 자동 조정
        if (this.selectionEnd < this.initialSelectionStart) {
            this.selectionStart = this.selectionEnd;
            this.selectionEnd = this.initialSelectionStart;
        } else {
            this.selectionStart = this.initialSelectionStart;
        }
        
        this.updateSelectionOverlay();
        this.updateTimeInputs();
        this.updatePreviewButton();
        
        // 드래그 중에는 오버레이만 업데이트 (성능 최적화)
    }

    endSelection(e) {
        if (!this.isSelecting) return;
        
        this.isSelecting = false;
        this.waveformCanvas.style.cursor = 'crosshair';
        
        // 최소 선택 구간 (0.1초)
        if (Math.abs(this.selectionEnd - this.selectionStart) < 0.1) {
            this.selectionEnd = Math.min(this.selectionStart + 0.1, this.audioBuffer.duration);
        }
        
        // start가 항상 end보다 작도록 보장
        if (this.selectionStart > this.selectionEnd) {
            [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
        }
        
        this.updateSelectionOverlay();
        this.updateTimeInputs();
        this.updatePreviewButton();
        
        // 선택 완료 시 파형 다시 그리기
        if (!this.isDrawing) {
            requestAnimationFrame(() => this.redrawWaveform());
        }
    }

    // 터치 이벤트 핸들러들
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.startSelection(mouseEvent);
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.updateSelection(mouseEvent);
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.endSelection(e);
    }

    // 향상된 마우스 핸들러
    handleMouseMove(e) {
        if (this.isSelecting) {
            this.updateSelection(e);
        } else {
            this.showTimeAtCursor(e);
        }
    }

    handleMouseLeave(e) {
        if (this.isSelecting) {
            this.endSelection(e);
        }
        this.hideTimeAtCursor();
    }

    // 커서 위치의 시간 표시
    showTimeAtCursor(e) {
        if (!this.audioBuffer) return;
        
        const rect = this.waveformCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / rect.width) * this.audioBuffer.duration;
        
        // 툴팁 생성 또는 업데이트
        let tooltip = document.getElementById('timeTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'timeTooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                pointer-events: none;
                z-index: 1000;
                transition: opacity 0.2s ease;
            `;
            document.body.appendChild(tooltip);
        }
        
        tooltip.textContent = this.formatTime(time);
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY - 30) + 'px';
        tooltip.style.opacity = '1';
    }

    hideTimeAtCursor() {
        const tooltip = document.getElementById('timeTooltip');
        if (tooltip) {
            tooltip.style.opacity = '0';
        }
    }

    updateSelectionFromInputs() {
        if (!this.audioBuffer) return;
        
        const start = parseFloat(this.startTimeInput.value) || 0;
        const end = parseFloat(this.endTimeInput.value) || this.audioBuffer.duration;
        
        this.selectionStart = Math.max(0, Math.min(start, this.audioBuffer.duration));
        this.selectionEnd = Math.max(this.selectionStart, Math.min(end, this.audioBuffer.duration));
        
        this.updateSelectionOverlay();
        this.updatePreviewButton();
        
        // 시간 입력 변경 시 파형 업데이트
        if (!this.isDrawing) {
            requestAnimationFrame(() => this.redrawWaveform());
        }
    }

    updateSelectionOverlay() {
        if (!this.audioBuffer) return;
        
        const startPercent = (this.selectionStart / this.audioBuffer.duration) * 100;
        const endPercent = (this.selectionEnd / this.audioBuffer.duration) * 100;
        
        this.selectionOverlay.style.left = startPercent + '%';
        this.selectionOverlay.style.width = (endPercent - startPercent) + '%';
        this.selectionOverlay.style.display = 'block';
    }

    updateTimeInputs() {
        this.startTimeInput.value = this.selectionStart.toFixed(1);
        this.endTimeInput.value = this.selectionEnd.toFixed(1);
        this.startTimeInput.max = this.audioBuffer.duration;
        this.endTimeInput.max = this.audioBuffer.duration;
    }

    async playAudio(start = 0, end = null) {
        if (!this.audioBuffer) return;
        
        this.stopAudio();
        
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.audioContext.destination);
        
        const startTime = start || 0;
        const duration = end ? (end - startTime) : undefined;
        
        this.sourceNode.start(0, startTime, duration);
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - startTime;
        
        this.playBtn.style.display = 'none';
        this.pauseBtn.style.display = 'flex';
        
        this.sourceNode.onended = () => {
            this.isPlaying = false;
            this.playBtn.style.display = 'flex';
            this.pauseBtn.style.display = 'none';
        };
    }

    pauseAudio() {
        if (this.sourceNode && this.isPlaying) {
            this.sourceNode.stop();
            this.pauseTime = this.audioContext.currentTime - this.startTime;
            this.isPlaying = false;
            this.playBtn.style.display = 'flex';
            this.pauseBtn.style.display = 'none';
        }
    }

    stopAudio() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode = null;
        }
        this.isPlaying = false;
        this.pauseTime = 0;
        this.playBtn.style.display = 'flex';
        this.pauseBtn.style.display = 'none';
    }

    async previewSelection() {
        if (!this.audioBuffer) return;
        
        // 이미 미리듣기 중이면 정지
        if (this.isPreviewing) {
            this.stopPreview();
            return;
        }
        
        // 선택된 구간이 없으면 알림
        if (this.selectionStart === this.selectionEnd) {
            alert('먼저 파형에서 구간을 선택해주세요!');
            return;
        }
        
        await this.ensureAudioContextActive();
        
        try {
            // 기존 재생 중지
            this.stopAudio();
            this.stopPreview();
            
            // 선택된 구간의 오디오 버퍼 생성
            const sampleRate = this.audioBuffer.sampleRate;
            const startSample = Math.floor(this.selectionStart * sampleRate);
            const endSample = Math.floor(this.selectionEnd * sampleRate);
            const length = endSample - startSample;
            
            if (length <= 0) {
                alert('유효하지 않은 선택 구간입니다.');
                return;
            }
            
            // 새로운 AudioBufferSourceNode 생성
            this.previewSourceNode = this.audioContext.createBufferSource();
            this.previewSourceNode.buffer = this.audioBuffer;
            this.previewSourceNode.connect(this.audioContext.destination);
            
            // 미리듣기 상태 설정
            this.isPreviewing = true;
            this.updatePreviewButton();
            
            // 선택된 구간만 재생
            const duration = this.selectionEnd - this.selectionStart;
            this.previewSourceNode.start(0, this.selectionStart, duration);
            
            // 재생 완료 시 자동으로 상태 리셋
            this.previewSourceNode.onended = () => {
                this.isPreviewing = false;
                this.previewSourceNode = null;
                this.updatePreviewButton();
            };
            
            console.log(`미리듣기: ${this.formatTime(this.selectionStart)} - ${this.formatTime(this.selectionEnd)}`);
            
        } catch (error) {
            console.error('미리듣기 오류:', error);
            alert('미리듣기 중 오류가 발생했습니다.');
            this.isPreviewing = false;
            this.updatePreviewButton();
        }
    }
    
    stopPreview() {
        if (this.previewSourceNode) {
            try {
                this.previewSourceNode.stop();
            } catch (error) {
                // 이미 정지된 경우 무시
            }
            this.previewSourceNode = null;
        }
        this.isPreviewing = false;
        this.updatePreviewButton();
    }
    
    updatePreviewButton() {
        if (!this.previewBtn) return;
        
        if (this.isPreviewing) {
            this.previewBtn.innerHTML = '⏹️ 미리듣기 정지';
            this.previewBtn.classList.add('playing');
        } else {
            this.previewBtn.innerHTML = '🎧 선택 구간 미리듣기';
            this.previewBtn.classList.remove('playing');
        }
        
        // 선택된 구간이 있을 때만 활성화
        const hasSelection = this.selectionStart !== this.selectionEnd;
        this.previewBtn.disabled = !this.audioBuffer || !hasSelection;
    }

    async downloadSelection() {
        if (!this.audioBuffer) return;
        
        this.showProgress('오디오를 처리 중...');
        
        try {
            const sampleRate = this.audioBuffer.sampleRate;
            const startSample = Math.floor(this.selectionStart * sampleRate);
            const endSample = Math.floor(this.selectionEnd * sampleRate);
            const length = endSample - startSample;
            
            // Create new audio buffer for the selected portion
            const newBuffer = this.audioContext.createBuffer(
                this.audioBuffer.numberOfChannels,
                length,
                sampleRate
            );
            
            // Copy selected audio data
            for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
                const oldData = this.audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                
                for (let i = 0; i < length; i++) {
                    newData[i] = oldData[startSample + i];
                }
            }
            
            // Convert to WAV and download
            const wavBlob = this.audioBufferToWav(newBuffer);
            const url = URL.createObjectURL(wavBlob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = this.generateFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.hideProgress();
            
        } catch (error) {
            console.error('Error downloading audio:', error);
            alert('오디오 다운로드 중 오류가 발생했습니다.');
            this.hideProgress();
        }
    }

    audioBufferToWav(buffer) {
        const length = buffer.length * buffer.numberOfChannels * 2 + 44;
        const arrayBuffer = new ArrayBuffer(length);
        const view = new DataView(arrayBuffer);
        const channels = [];
        let offset = 0;
        let pos = 0;

        // Write WAV header
        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }

        // RIFF chunk descriptor
        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        // FMT sub-chunk
        setUint32(0x20746d66); // "fmt "
        setUint32(16); // length of FMT data
        setUint16(1); // type of format (1 is PCM)
        setUint16(buffer.numberOfChannels);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg bytes per sec
        setUint16(buffer.numberOfChannels * 2); // block align
        setUint16(16); // bits per sample

        // Data sub-chunk
        setUint32(0x61746164); // "data"
        setUint32(length - pos - 4); // chunk data size

        // Write interleaved data
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        while (pos < length) {
            for (let i = 0; i < buffer.numberOfChannels; i++) {
                let sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    generateFileName() {
        const baseName = this.originalFileName.replace(/\.[^/.]+$/, "");
        const startMin = Math.floor(this.selectionStart / 60);
        const startSec = Math.floor(this.selectionStart % 60);
        const endMin = Math.floor(this.selectionEnd / 60);
        const endSec = Math.floor(this.selectionEnd % 60);
        
        return `${baseName}_${startMin}m${startSec}s-${endMin}m${endSec}s.wav`;
    }

    showAudioSection() {
        this.audioSection.style.display = 'block';
    }

    showProgress(text) {
        this.progressSection.style.display = 'block';
        this.progressText.textContent = text;
        this.progressFill.style.width = '0%';
        
        // Simulate progress animation
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            this.progressFill.style.width = progress + '%';
            if (progress >= 90) {
                clearInterval(interval);
            }
        }, 100);
    }

    hideProgress() {
        this.progressSection.style.display = 'none';
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// 브라우저 지원 확인 함수
function checkBrowserSupport() {
    const support = {
        webAudio: !!(window.AudioContext || window.webkitAudioContext),
        fileAPI: !!(window.File && window.FileReader && window.FileList && window.Blob),
        canvas: !!document.createElement('canvas').getContext,
        dragDrop: 'draggable' in document.createElement('span')
    };
    
    console.log('브라우저 지원 현황:', support);
    
    if (!support.webAudio) {
        alert('이 브라우저는 Web Audio API를 지원하지 않습니다.\n최신 Chrome, Firefox, Safari를 사용해주세요.');
        return false;
    }
    
    if (!support.fileAPI) {
        alert('이 브라우저는 파일 업로드를 지원하지 않습니다.');
        return false;
    }
    
    return true;
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    if (checkBrowserSupport()) {
        console.log('CutSong 오디오 편집기를 시작합니다...');
        new AudioCutter();
    }
}); 