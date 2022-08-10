import {
   AdapterDerived,
   AdapterFilters,
   AdapterSort,
   DynReducerUtils,
   IndexerAPI
} from '../common/index.js';

import { Indexer }               from './Indexer.js';

import type {
   CompareFn,
   DataDynArray,
   DataFilter,
   DataHost,
   FilterFn}                     from '../types.js';

import { DerivedArrayReducer }   from './derived/DerivedArrayReducer.js';

import { DerivedAPI }            from '../common/index.js';

/**
 * Provides a managed array with non-destructive reducing / filtering / sorting capabilities with subscription /
 * Svelte store support.
 */
export class DynArrayReducer<T>
{
   #array: DataHost<T[]> = [null];

   readonly #derived: AdapterDerived<T[], number, T>;

   readonly #derivedPublicAPI: DerivedAPI<T[], number, T>;

   readonly #filters: AdapterFilters<T>;

   readonly #filtersAdapter: { filters: DataFilter<T>[] } = { filters: [] };

   readonly #index: Indexer<T>;

   readonly #indexPublicAPI: IndexerAPI<number, T>;

   #reversed: boolean = false;

   readonly #sort: AdapterSort<T>;

   #sortAdapter: { compareFn: CompareFn<T> } = { compareFn: null };

   #subscriptions = [];

   /**
    * Initializes DynArrayReducer. Any iterable is supported for initial data. Take note that if `data` is an array it
    * will be used as the host array and not copied. All non-array iterables otherwise create a new array / copy.
    *
    * @param [data] - Data iterable to store if array or copy otherwise.
    */
   constructor(data?: Iterable<T>|DataDynArray<T>)
   {
      let dataIterable = void 0;

      let filters: Iterable<FilterFn<T>|DataFilter<T>> = void 0;

      let sort = void 0;

      if (data === null)
      {
         throw new TypeError(`DynArrayReducer error: 'data' is not iterable.`);
      }

      if (data !== void 0 && typeof data !== 'object' && !DynReducerUtils.isIterable(data))
      {
         throw new TypeError(`DynArrayReducer error: 'data' is not iterable.`);
      }

      if (data !== void 0 && Symbol.iterator in (data as Iterable<T>))
      {
         dataIterable = data;
      }
      else if (data !== void 0 && ('data' in data || 'filters' in data || 'sort' in data))
      {
         if (data.data !== void 0 && !DynReducerUtils.isIterable(data.data))
         {
            throw new TypeError(`DynArrayReducer error (DataDynArray): 'data' attribute is not iterable.`);
         }

         dataIterable = data.data;

         if (data.filters !== void 0)
         {
            if (DynReducerUtils.isIterable(data.filters))
            {
               filters = data.filters;
            }
            else
            {
               throw new TypeError(`DynArrayReducer error (DataDynArray): 'filters' attribute is not iterable.`);
            }
         }

         if (data.sort !== void 0)
         {
            if (typeof data.sort === 'function')
            {
               sort = data.sort;
            }
            else
            {
               throw new TypeError(`DynArrayReducer error (DataDynArray): 'sort' attribute is not a function.`);
            }
         }
      }

      // In the case of the main data being an array directly use the array otherwise create a copy.
      if (dataIterable)
      {
         this.#array[0] = Array.isArray(dataIterable) ? dataIterable : [...dataIterable];
      }

      this.#index = new Indexer(this.#array, this.#updateSubscribers.bind(this));
      this.#indexPublicAPI = new IndexerAPI<number, T>(this.#index);

      this.#filters = new AdapterFilters(this.#indexPublicAPI.update, this.#filtersAdapter);

      this.#sort = new AdapterSort(this.#indexPublicAPI.update, this.#sortAdapter);

      this.#derived = new AdapterDerived(this.#array, this.#indexPublicAPI, DerivedArrayReducer);
      this.#derivedPublicAPI = new DerivedAPI<T[], number, T>(this.#derived);

      this.#index.initAdapters(this.#filtersAdapter, this.#sortAdapter, this.#derived);

      // Add any filters and sort function defined by DataDynArray.
      if (filters) { this.filters.add(...filters); }
      if (sort) { this.sort.set(sort); }
   }

   /**
    * Returns the internal data of this instance. Be careful!
    *
    * Note: if an array is set as initial data then that array is used as the internal data. If any changes are
    * performed to the data externally do invoke {@link AdapterIndexer.index.update} with `true` to recalculate the
    * index and notify all subscribers.
    *
    * @returns The internal data.
    */
   get data(): T[]|null { return this.#array[0]; }

   /**
    * @returns Derived public API.
    */
   get derived(): DerivedAPI<T[], number, T> { return this.#derivedPublicAPI; }

   /**
    * @returns The filters adapter.
    */
   get filters(): AdapterFilters<T> { return this.#filters; }

   /**
    * @returns Returns the Indexer public API.
    */
   get index(): IndexerAPI<number, T> { return this.#indexPublicAPI; }

   /**
    * Gets the main data / items length.
    *
    * @returns {number} Main data / items length.
    */
   get length()
   {
      const array = this.#array[0];
      return this.#index.isActive ? this.#indexPublicAPI.length :
       array ? array.length : 0;
   }

   /**
    * Gets current reversed state.
    *
    * @returns {boolean} Reversed state.
    */
   get reversed() { return this.#reversed; }

   /**
    * @returns The sort adapter.
    */
   get sort(): AdapterSort<T> { return this.#sort; }

   /**
    * Sets reversed state and notifies subscribers.
    *
    * @param reversed - New reversed state.
    */
   set reversed(reversed: boolean)
   {
      if (typeof reversed !== 'boolean')
      {
         throw new TypeError(`DynArrayReducer.reversed error: 'reversed' is not a boolean.`);
      }

      this.#reversed = reversed;
      this.#index.reversed = reversed;

      // Recalculate index and force an update to any subscribers.
      this.index.update(true);
   }

   /**
    * Removes internal data and pushes new data. This does not destroy any initial array set to internal data unless
    * `replace` is set to true.
    *
    * @param data - New data to set to internal data.
    *
    * @param replace=false - New data to set to internal data.
    */
   setData(data: T[] | Iterable<T> | null, replace: boolean = false)
   {
      if (data !== null && !DynReducerUtils.isIterable(data))
      {
         throw new TypeError(`DynArrayReducer.setData error: 'data' is not iterable.`);
      }

      if (typeof replace !== 'boolean')
      {
         throw new TypeError(`DynArrayReducer.setData error: 'replace' is not a boolean.`);
      }

      const array = this.#array[0];

      // If the array isn't defined or 'replace' is true then replace internal data with new array or create an array
      // from an iterable.
      if (!Array.isArray(array) || replace)
      {
         if (data)
         {
            this.#array[0] = Array.isArray(data) ? data : [...data];
         }
      }
      else
      {
         if (data)
         {
            // Remove all entries in internal data. This will not replace any initially set array.
            array.length = 0;

            // Add all new data.
            array.push(...data);
         }
         else
         {
            this.#array[0] = null;
         }
      }

      // Recalculate index and force an update to any subscribers.
      this.index.update(true);
   }

   /**
    *
    * @param handler - Callback function that is invoked on update / changes. Receives `this` reference.
    *
    * @returns Unsubscribe function.
    */
   subscribe(handler: (value: DynArrayReducer<T>) => void): () => void
   {
      this.#subscriptions.push(handler); // add handler to the array of subscribers

      handler(this);                     // call handler with current value

      // Return unsubscribe function.
      return () =>
      {
         const index = this.#subscriptions.findIndex((sub) => sub === handler);
         if (index >= 0) { this.#subscriptions.splice(index, 1); }
      };
   }

   /**
    *
    */
   #updateSubscribers()
   {
      for (let cntr = 0; cntr < this.#subscriptions.length; cntr++) { this.#subscriptions[cntr](this); }
   }

   /**
    * Provides an iterator for data stored in DynArrayReducer.
    *
    * @returns Generator / iterator of all data.
    * @yields {T}
    */
   *[Symbol.iterator](): Generator<T, T, T>
   {
      const array = this.#array[0];

      if (array === null || array?.length === 0) { return; }

      if (this.#index.isActive)
      {
         for (const entry of this.index) { yield array[entry]; }
      }
      else
      {
         if (this.reversed)
         {
            for (let cntr = array.length; --cntr >= 0;) { yield array[cntr]; }
         }
         else
         {
            for (let cntr = 0; cntr < array.length; cntr++) { yield array[cntr]; }
         }
      }
   }
}
