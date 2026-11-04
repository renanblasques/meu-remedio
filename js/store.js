/** Estado compartilhado e operações do domínio; sem dependência de interface. */
(function (root) {
  'use strict';
  const { appReducer, createSeed, reconcile } = root.MeuRemedio.domain;
  const TEMPORARY =
    'Não foi possível salvar no navegador. Os dados desta sessão continuam disponíveis enquanto a página estiver aberta. Tente salvar novamente antes de fechar.';

  function createStore(repository, date) {
    let state = null;
    let error = null;
    let fatal = false;
    const listeners = new Set();
    const seed = () => createSeed(date);
    try {
      state = reconcile(repository.load() || seed());
      try {
        repository.save(state);
      } catch {
        error = TEMPORARY;
      }
    } catch (cause) {
      if (cause.code === 'CORRUPT_DATA') {
        fatal = true;
        error =
          'Não foi possível abrir os dados salvos. Você pode reiniciar a demonstração para começar de novo.';
      } else {
        state = seed();
        error = TEMPORARY;
      }
    }
    const emit = () => listeners.forEach((listener) => listener());
    return {
      get state() {
        return state;
      },
      get error() {
        return error;
      },
      get fatal() {
        return fatal;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      /** As gravações são síncronas: ações rápidas sempre usam o estado mais recente. */
      dispatch(action, requireSaved = false) {
        if (!state) return 'Os dados do aplicativo não estão disponíveis.';
        let next;
        try {
          next = appReducer(state, action);
        } catch (cause) {
          return cause.message || 'Não foi possível concluir a ação.';
        }
        try {
          repository.save(next);
          error = null;
        } catch {
          error = TEMPORARY;
          if (requireSaved) {
            emit();
            return 'Não foi possível salvar. Seu formulário foi mantido; tente novamente.';
          }
        }
        state = next;
        emit();
        return null;
      },
      retrySave() {
        if (!state) return;
        try {
          repository.save(state);
          error = null;
        } catch {
          error = TEMPORARY;
        }
        emit();
      },
      reset() {
        const initial = seed();
        try {
          repository.save(initial);
          error = null;
        } catch {
          error = TEMPORARY;
        }
        state = initial;
        fatal = false;
        try {
          repository.clearPhotos();
        } catch {
          /* O cenário continua utilizável em memória. */
        }
        emit();
      },
    };
  }
  root.MeuRemedio.createStore = createStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createStore };
})(globalThis);
