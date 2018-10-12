// tslint:disable-next-line:no-import-side-effect
import 'symbol-observable';
import {Stream} from 'xstream';
import {from, Observable} from 'rxjs';
import {setAdapt} from '@cycle/run/lib/adapt';
import {setup as coreSetup, DisposeFunction, Drivers, Main} from '@cycle/run';

export type MainOutputs<M extends Main> = {
  [k in string & keyof ReturnType<M>]: ReturnType<M>[k]
};

export type DriverInputs<M extends Main> = {
  [k in string & keyof ReturnType<M>]: ReturnType<M>[k] extends Observable<
    infer T
  >
    ? Stream<T>
    : never
};

export type DriverOutputs<D extends Drivers> = {
  [k in keyof D]: ReturnType<D[k]>
};

export type MainInputs<D extends Drivers> = {
  [k in keyof D]: ReturnType<D[k]> extends Stream<infer T>
    ? Observable<T>
    : ReturnType<D[k]>
};

export type MatchingMain<D extends Drivers, M extends Main> = Main & {
  (so?: Partial<MainInputs<D>>): MainOutputs<M>;
};

export type MatchingDrivers<D extends Drivers, M extends Main> = Drivers &
  {
    [k in string & keyof MainOutputs<M>]:
      | ((si?: DriverInputs<M>[k]) => DriverOutputs<D>[k])
      | ((si: DriverInputs<M>[k]) => DriverOutputs<D>[k])
  };

export interface CycleProgram<
  D extends MatchingDrivers<D, M>,
  M extends MatchingMain<D, M>
> {
  sources: MainInputs<D>;
  sinks: MainOutputs<M>;
  run(): DisposeFunction;
}

setAdapt(function adaptXstreamToRx(stream: Stream<any>): Observable<any> {
  return from(stream as any);
});

/**
 * Takes a `main` function and circularly connects it to the given collection
 * of driver functions.
 *
 * **Example:**
 * ```js
 * import run from '@cycle/rxjs-run';
 * const dispose = run(main, drivers);
 * // ...
 * dispose();
 * ```
 *
 * The `main` function expects a collection of "source" Observables (returned
 * from drivers) as input, and should return a collection of "sink" Observables
 * (to be given to drivers). A "collection of Observables" is a JavaScript
 * object where keys match the driver names registered by the `drivers` object,
 * and values are the Observables. Refer to the documentation of each driver to
 * see more details on what types of sources it outputs and sinks it receives.
 *
 * @param {Function} main a function that takes `sources` as input
 * and outputs a collection of `sinks` Observables.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Function} a dispose function, used to terminate the execution of the
 * Cycle.js program, cleaning up resources used.
 * @function run
 */
export function run<
  D extends MatchingDrivers<D, M>,
  M extends MatchingMain<D, M>
>(main: M, drivers: D): DisposeFunction {
  const program = coreSetup(main, drivers as any);
  return program.run();
}

/**
 * A function that prepares the Cycle application to be executed. Takes a `main`
 * function and prepares to circularly connects it to the given collection of
 * driver functions. As an output, `setup()` returns an object with three
 * properties: `sources`, `sinks` and `run`. Only when `run()` is called will
 * the application actually execute. Refer to the documentation of `run()` for
 * more details.
 *
 * **Example:**
 * ```js
 * import {setup} from '@cycle/rxjs-run';
 * const {sources, sinks, run} = setup(main, drivers);
 * // ...
 * const dispose = run(); // Executes the application
 * // ...
 * dispose();
 * ```
 *
 * @param {Function} main a function that takes `sources` as input
 * and outputs a collection of `sinks` Observables.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Object} an object with three properties: `sources`, `sinks` and
 * `run`. `sources` is the collection of driver sources, `sinks` is the
 * collection of driver sinks, these can be used for debugging or testing. `run`
 * is the function that once called will execute the application.
 * @function setup
 */
export function setup<
  D extends MatchingDrivers<D, M>,
  M extends MatchingMain<D, M>
>(main: M, drivers: D): CycleProgram<D, M> {
  return coreSetup(main, drivers as any) as any;
}

export default run;
