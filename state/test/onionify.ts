// tslint:disable-next-line
import 'mocha';
import * as assert from 'assert';
import xs, {Stream} from 'xstream';
import delay from 'xstream/extra/delay';
import isolate from '@cycle/isolate';
import onionify, {
  StateSource,
  Reducer,
  isolateSource,
  isolateSink,
  Lens,
} from '../src/index';

describe('onionify', function() {
  it('returns a wrapped main function', () => {
    function main() {
      return {onion: xs.never()};
    }

    const wrapped = onionify(main);
    assert.strictEqual(typeof wrapped, 'function');
  });

  it('inner function receives StateSource under sources.onion', () => {
    function main(sources: {onion: StateSource<any>}) {
      assert.strictEqual(!!sources.onion, true);
      assert.strictEqual(typeof sources.onion, 'object');
      assert.strictEqual(typeof sources.onion.state$, 'object');
      assert.strictEqual(typeof sources.onion.select, 'function');
      assert.strictEqual(typeof sources.onion.isolateSource, 'function');
      assert.strictEqual(typeof sources.onion.isolateSink, 'function');
      return {onion: xs.never()};
    }

    const wrapped = onionify(main);
    wrapped({});
  });

  it('inner function receives StateSource under sources.whatever', () => {
    function main(sources: {whatever: StateSource<any>}) {
      assert.strictEqual(!!sources.whatever, true);
      assert.strictEqual(typeof sources.whatever, 'object');
      assert.strictEqual(typeof sources.whatever.state$, 'object');
      assert.strictEqual(typeof sources.whatever.select, 'function');
      assert.strictEqual(typeof sources.whatever.isolateSource, 'function');
      assert.strictEqual(typeof sources.whatever.isolateSink, 'function');
      return {whatever: xs.never()};
    }

    const wrapped = onionify(main, 'whatever');
    wrapped({});
  });

  it('inner function takes StateSource, sends reducers to sink', done => {
    type State = {foo: string};

    const expected = ['bar'];
    function main(sources: {onion: StateSource<State>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.foo, expected.shift());
        },
        error(e) {},
        complete() {},
      });

      return {
        onion: xs.of(function reducer1(prevState: State): State {
          return {foo: 'bar'};
        }),
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(expected.length, 0);
      done();
    });
  });

  it('StateSource.state$ never emits if no sink reducer was emitted', done => {
    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      sources.onion.state$.addListener({
        next(x) {
          done('StateSource should not emit in this case');
        },
        error(e) {
          done(e);
        },
        complete() {
          done('StateSource should not complete');
        },
      });

      return {
        onion: xs.never(),
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(done);
  });

  it('reducers receive previous state', done => {
    const expected = [7, 10, 15, 25];
    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);

      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      const reducer$ = xs.of(
        () => ({count: 7}),
        (prevState: any) => ({count: prevState.count + 3}),
        (prevState: any) => ({count: prevState.count + 5}),
        (prevState: any) => ({count: prevState.count + 10})
      );

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(expected.length, 0);
      done();
    });
  });

  it('top level default reducer sees undefined prev state', done => {
    type State = {foo: string};
    let calledSource = false;
    let calledSink = false;
    function main(sources: {onion: StateSource<State>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.foo, 'bar');
          calledSource = true;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      return {
        onion: xs.of(function defaultReducer(prevState?: State): State {
          assert.strictEqual(typeof prevState, 'undefined');
          calledSink = true;
          if (typeof prevState === 'undefined') {
            return {foo: 'bar'};
          } else {
            return prevState;
          }
        }),
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledSource, true);
      assert.strictEqual(calledSink, true);
      done();
    });
  });

  it('child component default reducer can get state from parent', done => {
    let calledSource = false;
    function child(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [7];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
          calledSource = true;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(function defaultReducer(prevState: any): any {
        if (typeof prevState === 'undefined') {
          return {count: 0};
        } else {
          return prevState;
        }
      });
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      const childSinks = isolate(child, 'child')(sources);
      const childReducer$ = childSinks.onion;

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return {child: {count: 7}};
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$);

      return {
        onion: reducer$ as any,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledSource, true);
      done();
    });
  });

  it('child component default reducer can set default state', done => {
    let calledSource = false;
    function child(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [0];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
          calledSource = true;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(function defaultReducer(prevState: any): any {
        if (typeof prevState === 'undefined') {
          return {count: 0};
        } else {
          return prevState;
        }
      });
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      const childSinks = isolate(child, 'child')(sources);
      const childReducer$ = childSinks.onion;

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return {};
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$) as Stream<
        Reducer<any>
      >;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledSource, true);
      done();
    });
  });

  it('child component can be isolated with a lens object as scope', done => {
    let calledChild = 0;
    let calledMain = 0;
    type ChildState = {
      celsius: number;
    };
    function child(sources: {onion: StateSource<ChildState>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [27, 37];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.celsius, expected.shift());
          calledChild += 1;
        },
        error(e) {
          done(e.message);
        },
        complete() {},
      });
      const reducer$ = xs.of(function increment(
        prevState: ChildState
      ): ChildState {
        return {celsius: prevState.celsius + 10};
      });
      return {
        onion: reducer$,
      };
    }

    type MainState = {
      deeply: {
        nested: {
          prop: {
            kelvin: number;
          };
        };
      };
    };
    function main(sources: {onion: StateSource<MainState>}) {
      const celsiusLens: Lens<MainState, ChildState> = {
        get: state => ({
          celsius: state ? state.deeply.nested.prop.kelvin - 273 : 0,
        }),
        set: (state, childState) => ({
          deeply: {
            nested: {prop: {kelvin: childState ? childState.celsius + 273 : 0}},
          },
        }),
      };

      const childSinks = isolate(child, {onion: celsiusLens})(sources);
      const childReducer$ = childSinks.onion;

      const expected = [300, 310];
      sources.onion.state$.addListener({
        next(s) {
          assert.strictEqual(s.deeply.nested.prop.kelvin, expected.shift());
          calledMain += 1;
        },
        error(e) {
          done(e.message);
        },
        complete() {},
      });

      const parentReducer$ = xs.of(function initReducer(
        prevState: MainState
      ): MainState {
        return {
          deeply: {
            nested: {
              prop: {
                kelvin: 300,
              },
            },
          },
        };
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$) as Stream<
        Reducer<MainState>
      >;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledChild, 2);
      assert.strictEqual(calledMain, 2);
      done();
    });
  });

  it('child component also gets undefined if parent has not initialized state', done => {
    let called = false;
    function child(sources: {onion: StateSource<any>}) {
      const expected = [0];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
          called = true;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(function defaultReducer(prevState: any): any {
        if (typeof prevState === 'undefined') {
          return {count: 0};
        } else {
          return prevState;
        }
      });
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      const childSinks = isolate(child, 'child')(sources);
      const childReducer$ = childSinks.onion;

      const reducer$ = childReducer$;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(called, true);
      done();
    });
  });

  it('should work with a manually isolated child component', done => {
    let calledChild = 0;
    let calledMain = 0;

    function child(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [7, 9];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
          calledChild += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(function(prevState: any): any {
        return {count: prevState.count + 2};
      });
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      const expected = [7, 9];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.child.count, expected.shift());
          calledMain += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      const childSinks = child({onion: isolateSource(sources.onion, 'child')});
      assert(childSinks.onion);
      const childReducer$ = isolateSink(childSinks.onion, 'child');

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return {child: {count: 7}};
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$);

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledChild, 2);
      assert.strictEqual(calledMain, 2);
      done();
    });
  });

  it('should work with an isolated child component', done => {
    let calledChild = 0;
    let calledMain = 0;
    function child(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [7, 9];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
          calledChild += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(function(prevState: any): any {
        return {count: prevState.count + 2};
      });
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [7, 9];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.child.count, expected.shift());
          calledMain += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      const childSinks = isolate(child, 'child')(sources);
      assert(childSinks.onion);
      const childReducer$ = childSinks.onion;

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return {child: {count: 7}};
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$) as Stream<
        Reducer<any>
      >;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledChild, 2);
      assert.strictEqual(calledMain, 2);
      done();
    });
  });

  it('should work with an isolated child component and falsy values', done => {
    let calledChild = 0;
    let calledMain = 0;
    function child(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [1, 0, -1];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x, expected.shift());
          calledChild += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(
        (prevCount: any) => prevCount - 1,
        (prevCount: any) => prevCount - 1
      ) as Stream<Reducer<any>>;
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [1, 0, -1];
      sources.onion.state$.addListener({
        next(x) {
          assert.strictEqual(x.count, expected.shift());
          calledMain += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      const childSinks = isolate(child, 'count')(sources);
      assert(childSinks.onion);
      const childReducer$ = childSinks.onion;

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return {count: 1};
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$) as Stream<
        Reducer<any>
      >;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledChild, 3);
      assert.strictEqual(calledMain, 3);
      done();
    });
  });

  it('should work with an isolated child component on an array subtree', done => {
    let calledChild = 0;
    let calledMain = 0;
    function child(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [[3], [3, 5]];
      sources.onion.state$.addListener({
        next(x) {
          assert.deepEqual(x, expected.shift());
          calledChild += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of((prevArr: Array<any>) => prevArr.concat(5));
      return {
        onion: reducer$ as Stream<Reducer<any>>,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [[3], [3, 5]];
      sources.onion.state$.addListener({
        next(x) {
          assert.deepEqual(x.list, expected.shift());
          calledMain += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      const childSinks = isolate(child, 'list')(sources);
      assert(childSinks.onion);
      const childReducer$ = childSinks.onion;

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return {list: [3]};
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$) as Stream<
        Reducer<any>
      >;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledChild, 2);
      assert.strictEqual(calledMain, 2);
      done();
    });
  });

  it('should work with an isolated child component on an array entry', done => {
    let calledSecond = 0;
    let calledMain = 0;
    function secondEntry(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [5, 15, 6];
      sources.onion.state$.addListener({
        next(x) {
          assert.deepEqual(x, expected.shift());
          calledSecond += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });
      const reducer$ = xs.of(
        (prevNum: number): number | undefined => prevNum + 10,
        (prevNum: number): number | undefined => void 0
      ) as Stream<Reducer<any>>;
      return {
        onion: reducer$,
      };
    }

    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [[3, 5, 6], [3, 15, 6], [3, 6]];
      sources.onion.state$.addListener({
        next(x) {
          assert.deepEqual(x, expected.shift());
          calledMain += 1;
        },
        error(e) {
          done(e);
        },
        complete() {},
      });

      const childSinks = isolate(secondEntry, 1)(sources);
      assert(childSinks.onion);
      const childReducer$ = childSinks.onion;

      const parentReducer$ = xs.of(function initReducer(prevState: any): any {
        return [3, 5, 6];
      });
      const reducer$ = xs.merge(parentReducer$, childReducer$) as Stream<
        Reducer<any>
      >;

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(calledSecond, 3);
      assert.strictEqual(calledMain, 3);
      done();
    });
  });

  it('not complete reducer stream neither source state$', done => {
    let called = false;
    function main(sources: {onion: StateSource<any>}) {
      assert(sources.onion);
      assert(sources.onion.state$);
      const expected = [[3, 5, 6]];
      sources.onion.state$.addListener({
        next(x) {
          assert.deepEqual(x, expected.shift());
          called = true;
        },
        error(e) {
          done(e);
        },
        complete() {
          done('should not complete');
        },
      });

      const reducer$ = xs.of(function initReducer(prevState: any): any {
        return [3, 5, 6];
      });

      return {
        onion: reducer$,
      };
    }

    const wrapped = onionify(main);
    wrapped({});
    setImmediate(() => {
      assert.strictEqual(called, true);
      done();
    });
  });
});
