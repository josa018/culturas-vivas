import { assert } from './assert';
import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
  SessionStore,
  ViewMode,
} from '../src/navigation/index';
import type { StorageAdapter } from '../src/navigation/index';

class MockStorage implements StorageAdapter {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function runVerificationSuite(): void {
  console.log('--- [TEST SUITE] Navigation & FSM Router Verification ---');

  // Test 1: SessionStore CRUD
  {
    const storage = new MockStorage();
    const store = new SessionStore(storage);

    const initial = store.createInitialSession(ScreenId.SPLASH);
    assert.equal(initial.currentScreen, ScreenId.SPLASH);
    assert.equal(initial.viewMode, null);
    assert.ok(initial.sessionId.length > 0);

    store.setViewMode(ViewMode.VR);
    const updated = store.getSession();
    assert.equal(updated?.viewMode, ViewMode.VR);

    store.setSurveyAnswers({ rating: 5, feedback: 'Excelente experiencia' });
    const withSurvey = store.getSession();
    assert.equal(withSurvey?.surveyAnswers?.rating, 5);

    store.clear();
    assert.equal(store.getSession(), null);
    console.log('✓ Test 1 Passed: SessionStore operates correctly');
  }

  // Test 2: Standard VR Linear Traversal
  {
    const storage = new MockStorage();
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    assert.equal(fsm.getCurrentScreen(), ScreenId.SPLASH);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    assert.equal(fsm.getCurrentScreen(), ScreenId.WELCOME);

    fsm.dispatch(NavigationAction.SELECT_VR);
    assert.equal(fsm.getCurrentScreen(), ScreenId.TUTORIAL);
    assert.equal(fsm.getSession().viewMode, ViewMode.VR);

    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);
    assert.equal(fsm.getCurrentScreen(), ScreenId.EXPERIENCE_3D);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    assert.equal(fsm.getCurrentScreen(), ScreenId.EXIT_MODAL);

    fsm.dispatch(NavigationAction.CONFIRM_EXIT);
    assert.equal(fsm.getCurrentScreen(), ScreenId.SURVEY);

    fsm.dispatch(NavigationAction.COMPLETE_SURVEY, {
      surveyAnswers: { rating: 4, feedback: 'Todo bien' },
    });
    assert.equal(fsm.getCurrentScreen(), ScreenId.WELCOME);
    assert.equal(fsm.getSession().surveyAnswers?.rating, 4);

    console.log('✓ Test 2 Passed: Full VR traversal (Screens 1 -> 6 -> Welcome) valid');
  }

  // Test 3: 2D Alternative Path
  {
    const storage = new MockStorage();
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    assert.equal(fsm.getCurrentScreen(), ScreenId.WELCOME);

    fsm.dispatch(NavigationAction.SELECT_2D);
    assert.equal(fsm.getCurrentScreen(), ScreenId.EXPERIENCE_3D);
    assert.equal(fsm.getSession().viewMode, ViewMode.TOUCH_2D);

    console.log('✓ Test 3 Passed: Alternative 2D path bypassing tutorial valid');
  }

  // Test 4: Modal Resume Flow
  {
    const storage = new MockStorage();
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_2D);
    assert.equal(fsm.getCurrentScreen(), ScreenId.EXPERIENCE_3D);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    assert.equal(fsm.getCurrentScreen(), ScreenId.EXIT_MODAL);

    fsm.dispatch(NavigationAction.RESUME_TOUR);
    assert.equal(fsm.getCurrentScreen(), ScreenId.EXPERIENCE_3D);

    console.log('✓ Test 4 Passed: Exit modal resumption back to 3D scene valid');
  }

  // Test 5: Illegal Transition Guard
  {
    const storage = new MockStorage();
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    assert.equal(fsm.getCurrentScreen(), ScreenId.SPLASH);
    assert.equal(fsm.canDispatch(NavigationAction.CONFIRM_EXIT), false);

    const resultingState = fsm.dispatch(NavigationAction.CONFIRM_EXIT);
    assert.equal(resultingState, ScreenId.SPLASH);
    assert.equal(fsm.getCurrentScreen(), ScreenId.SPLASH);

    console.log('✓ Test 5 Passed: Illegal transitions safely rejected');
  }

  // Test 6: Listener Subscriptions
  {
    const storage = new MockStorage();
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    const emittedScreens: (typeof ScreenId)[keyof typeof ScreenId][] = [];
    const unsubscribe = fsm.subscribe((screenId) => {
      emittedScreens.push(screenId);
    });

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_VR);

    unsubscribe();

    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);

    assert.deepEqual(emittedScreens, [
      ScreenId.SPLASH,
      ScreenId.WELCOME,
      ScreenId.TUTORIAL,
    ]);

    console.log('✓ Test 6 Passed: Subscription lifecycle verified');
  }

  console.log('\nAll 6 tests passed successfully.');
}

runVerificationSuite();
