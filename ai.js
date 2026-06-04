
"use strict";

/*
  ============================================================
  わんこそば連打ゲーム
  AI反射神経年齢の予測機能
  ============================================================

  このファイルを index.html と同じ場所へ置く。

  記録するデータ:
  ・平均反応時間
  ・反応時間の中央値
  ・正解率
  ・ミス回数
  ・杯数
  ・回答回数

  入力された実年齢は、
  AIの予測結果との差を表示するために使用する。

  注意:
  現在は動作確認用の仮モデル。
  実際に複数人のデータを集めた後、
  学習済みモデルへ差し替えられる。
*/


(() => {
  /* =========================================================
     二重読み込み防止
  ========================================================= */

  if (
    window.__wankosobaAiLoaded
  ) {
    return;
  }

  window.__wankosobaAiLoaded =
    true;


  /* =========================================================
     設定
  ========================================================= */

  const AI_SETTINGS = {
    /*
      ブラウザ内へ記録を保存するときの名前
    */

    storageKey:
      "wankosoba-ai-records-v1",


    /*
      反射神経年齢の範囲
    */

    minPredictedAge:
      5,

    maxPredictedAge:
      90,
  };


  /*
    ============================================================
    動作確認用の仮モデル
    ============================================================

    後から実際のプレイデータを使って、
    Pythonなどで学習した係数へ交換できる。

    予測に使う要素:
    ・平均反応時間
    ・反応時間中央値
    ・正解率
    ・ミス回数
    ・杯数
    ・回答回数
  */

  const MODEL = {
    status:
      "provisional",

    label:
      "仮モデル",

    intercept:
      28,

    coefficients: {
      avgReactionMs:
        0.015,

      medianReactionMs:
        0.008,

      accuracy:
        -16,

      mistakes:
        1.25,

      bowls:
        -0.18,

      responses:
        -0.05,
    },

    baseline: {
      avgReactionMs:
        600,

      medianReactionMs:
        560,

      accuracy:
        0.85,

      mistakes:
        1,

      bowls:
        12,

      responses:
        18,
    },
  };


  /* =========================================================
     プレイ中のAI計測状態
  ========================================================= */

  let session =
    null;


  /* =========================================================
     共通処理
  ========================================================= */

  function clamp(
    value,
    min,
    max,
  ) {
    return Math.min(
      max,

      Math.max(
        min,
        value,
      ),
    );
  }


  function calculateMedian(
    values,
  ) {
    if (
      values.length
      === 0
    ) {
      return 0;
    }

    const sorted =
      [
        ...values,
      ]
        .sort(
          (
            a,
            b,
          ) => {
            return (
              a
              - b
            );
          },
        );

    const middle =
      Math.floor(
        sorted.length
        / 2,
      );

    if (
      sorted.length
      % 2
      === 1
    ) {
      return sorted[
        middle
      ];
    }

    return (
      sorted[
        middle - 1
      ]
      + sorted[
        middle
      ]
    )
    / 2;
  }


  function getAgeInput() {
    return document.querySelector(
      "#actual-age-input",
    );
  }


  function getActualAge() {
    const input =
      getAgeInput();

    if (
      !input
    ) {
      return null;
    }

    const age =
      Number.parseInt(
        input.value,
        10,
      );

    if (
      !Number.isFinite(
        age,
      )
      || age < 5
      || age > 99
    ) {
      return null;
    }

    return age;
  }


  function requireAge() {
    const age =
      getActualAge();

    if (
      age !== null
    ) {
      return true;
    }

    alert(
      "ゲームを始める前に、実年齢を5〜99歳で入力してください。",
    );

    getAgeInput()
      ?.focus();

    return false;
  }


  /* =========================================================
     AIの計測開始
  ========================================================= */

  function startSession() {
    const actualAge =
      getActualAge();

    if (
      actualAge === null
    ) {
      return false;
    }

    session = {
      actualAge,

      /*
        現在の食べ物が表示された時刻
      */

      itemShownAt:
        0,

      /*
        同じ食べ物で複数回押しても、
        最初の反応だけを計測する
      */

      currentItemRecorded:
        false,

      reactionTimes:
        [],

      correctDecisions:
        0,

      mistakes:
        0,

      responses:
        0,

      finished:
        false,
    };

    return true;
  }


  /* =========================================================
     食べ物が表示された瞬間を記録
  ========================================================= */

  function onItemShown(
    item,
  ) {
    if (
      !session
      || session.finished
      || !item
    ) {
      return;
    }

    session.itemShownAt =
      performance.now();

    session.currentItemRecorded =
      false;
  }


  /* =========================================================
     押したボタンが正解か判定
  ========================================================= */

  function isCorrectAction(
    action,
    item,
  ) {
    /*
      岩・ダークマター
      → 食べないが正解
    */

    if (
      item.category
      === "bad"
    ) {
      return (
        action
        === "skip"
      );
    }


    /*
      麺・薬味・岩塩・苔
      → 食べるが正解
    */

    return (
      action
      === "eat"
    );
  }


  /* =========================================================
     食べる・食べないを押したときの計測
  ========================================================= */

  function onAction(
    action,
    item,
  ) {
    if (
      !session
      || session.finished
      || !item
      || session.currentItemRecorded
    ) {
      return;
    }

    const reactionMs =
      Math.max(
        0,

        performance.now()
        - session.itemShownAt,
      );

    session
      .reactionTimes
      .push(
        reactionMs,
      );

    session.responses +=
      1;

    session.currentItemRecorded =
      true;

    if (
      isCorrectAction(
        action,
        item,
      )
    ) {
      session.correctDecisions +=
        1;
    }

    else {
      session.mistakes +=
        1;
    }
  }


  /* =========================================================
     AIによる反射神経年齢の予測
  ========================================================= */

  function predictReflexAge(
    metrics,
  ) {
    let predictedAge =
      MODEL.intercept;

    predictedAge +=
      (
        metrics.avgReactionMs
        - MODEL.baseline.avgReactionMs
      )
      * MODEL.coefficients.avgReactionMs;

    predictedAge +=
      (
        metrics.medianReactionMs
        - MODEL.baseline.medianReactionMs
      )
      * MODEL.coefficients.medianReactionMs;

    predictedAge +=
      (
        metrics.accuracy
        - MODEL.baseline.accuracy
      )
      * MODEL.coefficients.accuracy;

    predictedAge +=
      (
        metrics.mistakes
        - MODEL.baseline.mistakes
      )
      * MODEL.coefficients.mistakes;

    predictedAge +=
      (
        metrics.bowls
        - MODEL.baseline.bowls
      )
      * MODEL.coefficients.bowls;

    predictedAge +=
      (
        metrics.responses
        - MODEL.baseline.responses
      )
      * MODEL.coefficients.responses;

    return Number(
      clamp(
        predictedAge,

        AI_SETTINGS.minPredictedAge,

        AI_SETTINGS.maxPredictedAge,
      )
        .toFixed(
          1,
        ),
    );
  }


  /* =========================================================
     ゲーム終了時にAI結果を作る
  ========================================================= */

  function finishSession(
    bowls,
    saveForTraining,
  ) {
    if (
      !session
      || session.finished
    ) {
      return null;
    }

    session.finished =
      true;

    const reactionTimes =
      session.reactionTimes;

    const avgReactionMs =
      reactionTimes.length
      > 0
        ? reactionTimes
            .reduce(
              (
                sum,
                value,
              ) => {
                return (
                  sum
                  + value
                );
              },
              0,
            )
          / reactionTimes.length
        : 1500;

    const medianReactionMs =
      reactionTimes.length
      > 0
        ? calculateMedian(
            reactionTimes,
          )
        : 1500;

    const accuracy =
      session.responses
      > 0
        ? session.correctDecisions
          / session.responses
        : 0;

    const metrics = {
      avgReactionMs:
        Number(
          avgReactionMs
            .toFixed(
              1,
            ),
        ),

      medianReactionMs:
        Number(
          medianReactionMs
            .toFixed(
              1,
            ),
        ),

      accuracy:
        Number(
          accuracy
            .toFixed(
              4,
            ),
        ),

      mistakes:
        session.mistakes,

      bowls,

      responses:
        session.responses,
    };

    const predictedAge =
      predictReflexAge(
        metrics,
      );

    const difference =
      Number(
        (
          predictedAge
          - session.actualAge
        )
          .toFixed(
            1,
          ),
      );

    const record = {
      recordedAt:
        new Date()
          .toISOString(),

      actualAge:
        session.actualAge,

      predictedAge,

      difference,

      modelStatus:
        MODEL.status,

      modelLabel:
        MODEL.label,

      ...metrics,
    };


    /*
      本番モードだけ、
      AI学習用データとしてブラウザへ保存する。
    */

    if (
      saveForTraining
    ) {
      saveRecord(
        record,
      );
    }

    return record;
  }


  /* =========================================================
     結果画面に表示する文章
  ========================================================= */

  function formatResult(
    record,
  ) {
    if (
      !record
    ) {
      return "";
    }

    let differenceText =
      "実年齢と同じくらい";

    if (
      record.difference
      < 0
    ) {
      differenceText =
        (
          `実年齢より `
          + `${Math.abs(
            record.difference,
          )}`
          + `歳 若い`
        );
    }

    if (
      record.difference
      > 0
    ) {
      differenceText =
        (
          `実年齢より `
          + `${record.difference}`
          + `歳 高い`
        );
    }

    return [
      "",
      "【AI反射神経年齢】",
      `実年齢: ${record.actualAge}歳`,
      `予測年齢: ${record.predictedAge}歳`,
      `判定: ${differenceText}`,
      `平均反応時間: ${Math.round(record.avgReactionMs)}ms`,
      `反応時間中央値: ${Math.round(record.medianReactionMs)}ms`,
      `正解率: ${(record.accuracy * 100).toFixed(1)}%`,
      `ミス回数: ${record.mistakes}回`,
      `回答回数: ${record.responses}回`,
      `使用モデル: ${record.modelLabel}`,
    ]
      .join(
        "\n",
      );
  }


  /* =========================================================
     AI学習用データの保存
  ========================================================= */

  function loadRecords() {
    try {
      const records =
        JSON.parse(
          localStorage.getItem(
            AI_SETTINGS.storageKey,
          )
          ?? "[]",
        );

      return Array.isArray(
        records,
      )
        ? records
        : [];
    }

    catch {
      return [];
    }
  }


  function saveRecord(
    record,
  ) {
    const records =
      loadRecords();

    records.push(
      record,
    );

    localStorage.setItem(
      AI_SETTINGS.storageKey,

      JSON.stringify(
        records,
      ),
    );
  }


  /* =========================================================
     CSVとして保存
  ========================================================= */

  function downloadRecords() {
    const records =
      loadRecords();

    if (
      records.length
      === 0
    ) {
      alert(
        "まだ保存できる本番モードの記録がありません。",
      );

      return;
    }

    const columns = [
      "actual_age",
      "avg_reaction_ms",
      "median_reaction_ms",
      "accuracy",
      "mistakes",
      "bowls",
      "responses",
      "predicted_age",
      "difference",
      "recorded_at",
    ];

    const lines = [
      columns.join(
        ",",
      ),
    ];

    for (
      const row
      of records
    ) {
      lines.push(
        [
          row.actualAge,
          row.avgReactionMs,
          row.medianReactionMs,
          row.accuracy,
          row.mistakes,
          row.bowls,
          row.responses,
          row.predictedAge,
          row.difference,
          row.recordedAt,
        ]
          .join(
            ",",
          ),
      );
    }

    const blob =
      new Blob(
        [
          "\uFEFF"
          + lines.join(
            "\n",
          ),
        ],

        {
          type:
            "text/csv;charset=utf-8",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const link =
      document.createElement(
        "a",
      );

    link.href =
      url;

    link.download =
      "wankosoba_ai_records.csv";

    document.body.append(
      link,
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url,
    );
  }


  /* =========================================================
     保存済みデータの削除
  ========================================================= */

  function clearRecords() {
    const accepted =
      confirm(
        "この端末に保存されたAI学習用データを削除しますか？",
      );

    if (
      !accepted
    ) {
      return;
    }

    localStorage.removeItem(
      AI_SETTINGS.storageKey,
    );

    alert(
      "AI学習用データを削除しました。",
    );
  }


  /* =========================================================
     タイトル画面へ年齢入力欄を自動追加
  ========================================================= */

  function injectTitleControls() {
    if (
      document.querySelector(
        "#actual-age-input",
      )
    ) {
      return;
    }

    const titleContent =
      document.querySelector(
        ".title-content",
      );

    const menuPanel =
      document.querySelector(
        ".menu-panel",
      );

    if (
      !titleContent
      || !menuPanel
    ) {
      return;
    }


    const agePanel =
      document.createElement(
        "div",
      );

    agePanel.className =
      "ai-age-panel";

    agePanel.innerHTML =
      `
        <label for="actual-age-input">
          実年齢
        </label>

        <input
          id="actual-age-input"
          type="number"
          min="5"
          max="99"
          inputmode="numeric"
          placeholder="例：21"
        >
      `;

    titleContent.insertBefore(
      agePanel,
      menuPanel,
    );


    const buttonPanel =
      document.createElement(
        "div",
      );

    buttonPanel.className =
      "ai-data-buttons";

    buttonPanel.innerHTML =
      `
        <button
          id="download-ai-data-button"
          type="button"
        >
          AI学習用CSVを保存
        </button>

        <button
          id="clear-ai-data-button"
          type="button"
        >
          AI記録を削除
        </button>
      `;

    titleContent.append(
      buttonPanel,
    );


    const note =
      document.createElement(
        "p",
      );

    note.className =
      "ai-note";

    note.textContent =
      "本番モードでは、AIが反応時間・正解率・ミス回数を分析します。";

    titleContent.append(
      note,
    );


    document
      .querySelector(
        "#download-ai-data-button",
      )
      .addEventListener(
        "click",
        downloadRecords,
      );


    document
      .querySelector(
        "#clear-ai-data-button",
      )
      .addEventListener(
        "click",
        clearRecords,
      );
  }


  /* =========================================================
     年齢入力欄の見た目を自動追加
  ========================================================= */

  function injectStyles() {
    if (
      document.querySelector(
        "#wankosoba-ai-style",
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style",
      );

    style.id =
      "wankosoba-ai-style";

    style.textContent =
      `
        .ai-age-panel {
          display: flex;

          align-items: center;
          justify-content: center;

          gap: 10px;

          width: min(330px, 78vw);

          margin: 9px 0;
          padding: 9px 14px;

          border: 3px solid #5a3518;

          background: #fff4cf;

          font-size: 19px;
          font-weight: 800;
        }

        .ai-age-panel input {
          width: 92px;

          padding: 6px 8px;

          border: 2px solid #5a3518;

          font-size: 19px;
          font-weight: 800;

          text-align: center;
        }

        .ai-data-buttons {
          display: flex;

          flex-wrap: wrap;
          justify-content: center;

          gap: 8px;

          width: min(520px, 90vw);

          margin-top: 10px;
        }

        .ai-data-buttons button {
          padding: 7px 11px;

          font-size: 13px;
        }

        .ai-note {
          margin-top: 7px !important;

          color: #fff1c8 !important;

          font-size: 12px !important;
          font-weight: 800 !important;

          text-shadow:
            1px 1px 0 #2b1709 !important;
        }
      `;

    document.head.append(
      style,
    );
  }


  /* =========================================================
     既存ゲームへAI機能を接続
  ========================================================= */

  function connectToGame() {
    /*
      index.html側のゲーム関数が
      読み込まれるまで少し待つ。
    */

    if (
      typeof startGame
      !== "function"
      || typeof nextItem
      !== "function"
      || typeof finishGame
      !== "function"
      || typeof gameState
      === "undefined"
    ) {
      window.setTimeout(
        connectToGame,
        100,
      );

      return;
    }


    if (
      window.__wankosobaAiConnected
    ) {
      return;
    }

    window.__wankosobaAiConnected =
      true;


    /*
      ゲーム開始時:
      年齢チェック
      ↓
      AI計測開始
    */

    const originalStartGame =
      startGame;

    window.startGame =
      function patchedStartGame(
        mode,
      ) {
        if (
          !requireAge()
        ) {
          return;
        }

        startSession();

        return originalStartGame(
          mode,
        );
      };


    /*
      新しい食べ物が出た瞬間:
      反応時間の計測開始
    */

    const originalNextItem =
      nextItem;

    window.nextItem =
      function patchedNextItem() {
        const result =
          originalNextItem();

        const currentItem =
          gameState.currentItem;

        window.requestAnimationFrame(
          () => {
            if (
              gameState.currentItem
              === currentItem
            ) {
              onItemShown(
                currentItem,
              );
            }
          },
        );

        return result;
      };


    /*
      「食べる」を押した瞬間:
      最初の反応を記録

      capture=true にすることで、
      元のゲーム処理より先に記録する。
    */

    document
      .querySelector(
        "#eat-button",
      )
      ?.addEventListener(
        "click",

        () => {
          onAction(
            "eat",
            gameState.currentItem,
          );
        },

        true,
      );


    /*
      「食べない」を押した瞬間:
      最初の反応を記録
    */

    document
      .querySelector(
        "#skip-button",
      )
      ?.addEventListener(
        "click",

        () => {
          onAction(
            "skip",
            gameState.currentItem,
          );
        },

        true,
      );


    /*
      ゲーム終了時:
      AI年齢を予測
      ↓
      結果画面へ追加
    */

    const originalFinishGame =
      finishGame;

    window.finishGame =
      function patchedFinishGame(
        forceMessage = "",
      ) {
        const result =
          originalFinishGame(
            forceMessage,
          );

        const aiResult =
          finishSession(
            gameState.totalBowls,

            gameState.mode
            === "real",
          );

        if (
          !aiResult
        ) {
          return result;
        }

        const resultMessage =
          document.querySelector(
            "#result-message",
          );

        if (
          resultMessage
        ) {
          resultMessage.textContent +=
            formatResult(
              aiResult,
            );
        }

        return result;
      };
  }


  /* =========================================================
     起動
  ========================================================= */

  function setup() {
    injectStyles();

    injectTitleControls();

    connectToGame();
  }


  if (
    document.readyState
    === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      setup,
    );
  }

  else {
    setup();
  }
})();
