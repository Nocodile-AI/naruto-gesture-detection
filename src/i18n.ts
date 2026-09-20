export const LANGUAGES = ["zh-Hant", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

type Params = Record<string, string | number>;

const LANGUAGE_STORAGE_KEY = "naruto-gesture-detection-language";

const translations = {
  en: {
    pageTitle: "Train your clone sign | naruto-gesture-detection",
    languageLabel: "Language",
    languageChinese: "中文",
    languageEnglish: "English",
    introTitlePrefix: "Train your",
    introTitleHighlight: "clone sign.",
    savedWorkChanged: "Saved work changed",
    reload: "Reload",
    camera: "Camera",
    cameraCanvasLabel: "Camera preview with hand tracking and shadow clones",
    cameraOff: "Camera is off",
    recording: "Recording",
    startCamera: "Start camera",
    stopCamera: "Stop camera",
    examples: "Examples",
    cloneSign: "Clone sign",
    notCloneSign: "Not clone sign",
    clips: "{count} clips",
    record: "Record",
    removeLast: "Remove last",
    trainModel: "Train model",
    startOver: "Start over",
    cancelRecording: "Cancel recording",
    retrySave: "Retry save",
    cancelTraining: "Cancel training",
    trainingProgress: "Training progress",
    cloneScore: "Clone-sign score",
    resetEffect: "Reset effect",
    editExamples: "Edit examples",
    startOverBody:
      "This clears naruto-gesture-detection examples and model files saved by this site.",
    keepWork: "Keep work",
    clearWork: "Clear work",
    notAvailable: "N/A",
    releaseToRearm: "Release to re-arm.",
    effectLoading: "Effect loading.",
    cloneSequenceActive: "Clone sequence active.",
    holdPercent: "Hold {percent}%",
    predictionFailed: "Prediction failed. Retrain the model.",
    loading: "Loading",
    cameraPaused: "Camera paused",
    saveFailed: "Save failed. {message} Retry before training.",
    recordingCancelled: "Recording cancelled.",
    usableFramesRetry: "{count} usable frames. Record this clip again.",
    trainingEpoch: "Training {epoch}/{total}",
    savingModel: "Saving model...",
    trainingCancelled: "Training cancelled.",
    trainingFailed: "Training failed. {message}",
    tryAgain: "Try again.",
    effectAssetsFailed: "Effect assets failed to load. {message}",
    savedWorkOpenFailed: "Saved work could not open. Reload or start over.",
    savedModelUnsafe: "Saved model data cannot be opened safely. Start over to clear it.",
    examplesChanged: "Examples changed after this model. Train again.",
    savedModelRestoreFailed: "Saved model could not be restored. Train again.",
    reloadBeforeContinuing: "Reload before continuing.",
    oldModelCleanupFailed: "Old model cleanup failed. Try Start over again.",
    resetFailed: "Reset failed. {message}",
    cameraPausedHidden: "Camera paused while this tab is hidden.",
    cameraResumed: "Camera resumed. Show both hands.",
    cameraStarting: "Camera starting...",
    cameraReadyTracking: "Camera ready. Loading hand tracking...",
    handTrackingInitFailed: "Hand tracking could not initialize.",
    cameraRunning: "Camera running. Show both hands.",
    handTrackingSlow:
      "Hand tracking is taking longer than expected. Close other heavy tabs or try a faster device if it does not recover.",
    handTrackingStopped: "Hand tracking stopped. Stop and start the camera to try again.",
    cameraDenied:
      "Camera access was denied. Allow camera permission for this site in your browser, then try again.",
    cameraNotFound: "No usable camera was found. Connect or enable a camera, then try again.",
    cameraBusy:
      "The camera is busy or could not be read. Close other camera apps or tabs, then try again.",
    cameraModeUnavailable:
      "The camera cannot provide the requested video mode. Try another camera or browser.",
    cameraStartFailed:
      "Camera could not start. Check its connection, browser permission, and other camera apps, then try again.",
    cameraRequiresSecure:
      "Camera access requires a secure HTTPS page or localhost. Open this demo from its HTTPS classroom link.",
    cameraApiUnavailable:
      "This browser does not provide the camera API required by the demo. Use a current Chromium, Firefox, or Edge browser.",
    storageFull:
      "Browser storage is full. Free site storage or disk space, then retry. Existing saved work was not replaced.",
    storageBlocked:
      "Browser storage is blocked or unavailable. Allow site storage and reload before collecting or training.",
    storageUnavailable: "Browser storage is unavailable. Check site storage settings and reload.",
    savedSamplesIncompatible:
      "Saved samples are corrupt or incompatible with this version. Your saved data was left untouched; use the compatible app version or clear this site's storage to start again.",
    savedModelIncompatible:
      "Saved model metadata is corrupt or incompatible. Retrain with this version; the previous saved model was left untouched.",
    samplesRevisionConflict:
      "Samples must advance exactly one revision. Reload saved work before retrying.",
    samplesChangedOtherTab:
      "Saved samples changed in another tab. Reload saved work before collecting more.",
    samplesChangedTraining:
      "Samples changed while training. Save current samples and train again; the previous model remains active.",
    resetEmptyDatasetFailed: "App reset did not create a new empty dataset.",
    expectedGestureFeatures: "Expected 129 finite gesture features.",
    recordBothPoses: "Record examples of both poses before training.",
    emptyTrainingClip: "A training clip has no usable frames.",
    invalidTrainingResult: "Training produced an invalid result. Record new examples and retry.",
    incompatibleModel: "The model is incompatible with the current gesture features.",
    invalidModelOutput: "The model did not return a single clone-sign score.",
    invalidCloneScore: "The model returned an invalid clone-sign score.",
  },
  "zh-Hant": {
    pageTitle: "訓練你的分身手勢 | naruto-gesture-detection",
    languageLabel: "語言",
    languageChinese: "中文",
    languageEnglish: "English",
    introTitlePrefix: "訓練你的",
    introTitleHighlight: "分身手勢。",
    savedWorkChanged: "已儲存的作品已變更",
    reload: "重新載入",
    camera: "鏡頭",
    cameraCanvasLabel: "含手部追蹤與影分身效果的鏡頭預覽",
    cameraOff: "鏡頭已關閉",
    recording: "錄製中",
    startCamera: "開啟鏡頭",
    stopCamera: "停止鏡頭",
    examples: "範例",
    cloneSign: "分身手勢",
    notCloneSign: "非分身手勢",
    clips: "{count} 段",
    record: "錄製",
    removeLast: "移除上一段",
    trainModel: "訓練模型",
    startOver: "重新開始",
    cancelRecording: "取消錄製",
    retrySave: "重試儲存",
    cancelTraining: "取消訓練",
    trainingProgress: "訓練進度",
    cloneScore: "分身手勢分數",
    resetEffect: "重設效果",
    editExamples: "編輯範例",
    startOverBody: "這會清除本網站儲存的 naruto-gesture-detection 範例與模型檔案。",
    keepWork: "保留作品",
    clearWork: "清除作品",
    notAvailable: "N/A",
    releaseToRearm: "放開以重新準備。",
    effectLoading: "效果載入中。",
    cloneSequenceActive: "分身序列啟動中。",
    holdPercent: "維持 {percent}%",
    predictionFailed: "預測失敗。請重新訓練模型。",
    loading: "載入中",
    cameraPaused: "鏡頭已暫停",
    saveFailed: "儲存失敗。{message} 請在訓練前重試。",
    recordingCancelled: "錄製已取消。",
    usableFramesRetry: "{count} 個可用畫面。請重新錄製這段。",
    trainingEpoch: "訓練中 {epoch}/{total}",
    savingModel: "正在儲存模型...",
    trainingCancelled: "訓練已取消。",
    trainingFailed: "訓練失敗。{message}",
    tryAgain: "請再試一次。",
    effectAssetsFailed: "效果素材載入失敗。{message}",
    savedWorkOpenFailed: "無法開啟已儲存的作品。請重新載入或重新開始。",
    savedModelUnsafe: "無法安全開啟已儲存的模型資料。請重新開始以清除。",
    examplesChanged: "範例在此模型之後已變更。請重新訓練。",
    savedModelRestoreFailed: "無法還原已儲存的模型。請重新訓練。",
    reloadBeforeContinuing: "繼續前請重新載入。",
    oldModelCleanupFailed: "舊模型清除失敗。請再次按重新開始。",
    resetFailed: "重設失敗。{message}",
    cameraPausedHidden: "此分頁隱藏時鏡頭已暫停。",
    cameraResumed: "鏡頭已恢復。請露出雙手。",
    cameraStarting: "鏡頭啟動中...",
    cameraReadyTracking: "鏡頭已就緒。正在載入手部追蹤...",
    handTrackingInitFailed: "無法初始化手部追蹤。",
    cameraRunning: "鏡頭運作中。請露出雙手。",
    handTrackingSlow: "手部追蹤花費時間較久。若未恢復，請關閉其他耗能分頁或改用更快的裝置。",
    handTrackingStopped: "手部追蹤已停止。請停止並重新開啟鏡頭再試一次。",
    cameraDenied: "鏡頭存取遭拒。請允許此網站使用鏡頭，然後再試一次。",
    cameraNotFound: "找不到可用鏡頭。請連接或啟用鏡頭，然後再試一次。",
    cameraBusy: "鏡頭忙碌或無法讀取。請關閉其他使用鏡頭的應用程式或分頁，然後再試一次。",
    cameraModeUnavailable: "鏡頭無法提供要求的影像模式。請嘗試其他鏡頭或瀏覽器。",
    cameraStartFailed:
      "鏡頭無法啟動。請檢查連線、瀏覽器權限與其他使用鏡頭的應用程式，然後再試一次。",
    cameraRequiresSecure:
      "鏡頭存取需要安全的 HTTPS 頁面或 localhost。請從 HTTPS 教室連結開啟此示範。",
    cameraApiUnavailable:
      "此瀏覽器未提供示範所需的鏡頭 API。請使用新版 Chromium、Firefox 或 Edge。",
    storageFull: "瀏覽器儲存空間已滿。請釋放網站儲存空間或磁碟空間後重試。既有作品未被取代。",
    storageBlocked: "瀏覽器儲存被封鎖或無法使用。請允許網站儲存並重新載入後再收集或訓練。",
    storageUnavailable: "瀏覽器儲存無法使用。請檢查網站儲存設定並重新載入。",
    savedSamplesIncompatible:
      "已儲存的樣本已損毀或與此版本不相容。你的已儲存資料未被更動；請使用相容的應用程式版本，或清除此網站的儲存空間後重新開始。",
    savedModelIncompatible:
      "已儲存的模型中繼資料已損毀或不相容。請使用此版本重新訓練；先前儲存的模型未被更動。",
    samplesRevisionConflict: "樣本版本必須剛好前進一版。請重新載入已儲存的作品後再試。",
    samplesChangedOtherTab: "已儲存的樣本已在另一個分頁變更。請重新載入已儲存的作品後再繼續收集。",
    samplesChangedTraining:
      "樣本在訓練期間已變更。請儲存目前樣本並重新訓練；先前的模型仍會保持啟用。",
    resetEmptyDatasetFailed: "應用程式重設未建立新的空白資料集。",
    expectedGestureFeatures: "預期有 129 個有限的手勢特徵。",
    recordBothPoses: "請先錄製兩種姿勢的範例再訓練。",
    emptyTrainingClip: "有一段訓練片段沒有可用畫面。",
    invalidTrainingResult: "訓練產生無效結果。請錄製新的範例後重試。",
    incompatibleModel: "此模型與目前的手勢特徵不相容。",
    invalidModelOutput: "模型未回傳單一分身手勢分數。",
    invalidCloneScore: "模型回傳了無效的分身手勢分數。",
  },
} as const;

type TranslationKey = keyof (typeof translations)["en"];

let language: Language = readStoredLanguage();
const listeners = new Set<() => void>();

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGES.includes(stored as Language) ? (stored as Language) : "zh-Hant";
  } catch {
    return "zh-Hant";
  }
}

function format(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

export function currentLanguage(): Language {
  return language;
}

export function setLanguage(next: Language): void {
  if (language === next) return;
  language = next;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {}
  for (const listener of listeners) listener();
}

export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: TranslationKey, params?: Params): string {
  return format(translations[language][key] ?? translations.en[key], params);
}

export function translateErrorMessage(message: string): string {
  for (const candidateLanguage of LANGUAGES) {
    const candidateTranslations = translations[candidateLanguage];
    for (const key of Object.keys(candidateTranslations) as TranslationKey[]) {
      if (candidateTranslations[key] === message) return t(key);
    }
  }
  return message;
}

export function applyDocumentTranslations(root: ParentNode = document): void {
  document.documentElement.lang = language;
  document.title = t("pageTitle");
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n as TranslationKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-label]").forEach((node) => {
    const label = t(node.dataset.i18nLabel as TranslationKey);
    node.setAttribute("aria-label", label);
    if ("label" in node) (node as HTMLElement & { label: string }).label = label;
  });
}
