/*
 * Copyright (c) 2010, 2025 BSI Business Systems Integration AG
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import {
  arrays, ClientUiPreferencesModel, dataObjects, InitModelOf, ITableCustomizerDo, IUserFilterStateDo, NumberColumn, objects, ObjectWithType, scout, Session, strings, Table, TableClientUiPreferenceProfileDo, TableClientUiPreferencesDo,
  TableColumnClientUiPreferenceDo, TableUserFilter, UserFilterStateMappers, webstorage
} from '../index';

// FIXME bsh [js-preferences] Handle errors so they will not be propagated to the user (see invokeSafe in ClientUiUserPreferences)
export class ClientUiPreferences implements ObjectWithType, ClientUiPreferencesModel {
  declare model: ClientUiPreferencesModel;

  /**
   * Key for global preferences of a table, i.e. preferences that are not stored to a specific settings profile.
   */
  static TABLE_PREFERENCE_PROFILE_ID_GLOBAL = 'global-' + 'a134390b-bfef-4b9e-a14e-425df161e768';

  /**
   * Factory settings for a bookmark. If a bookmark is reset to factory settings, the bookmarked settings are restored.
   */
  static TABLE_PREFERENCE_PROFILE_ID_BOOKMARK = 'bookmark-' + 'aebcacd2-ddb6-4b7f-8673-d1585701d388';

  protected static _INSTANCES: Map<Session, ClientUiPreferences> = new Map();

  objectType: string;

  protected _tablePreferences: TableClientUiPreferencesDo[];
  /**
   * Map of all table preferences in {@link _tablePreferences}, indexed by table identifier (see {@link _computeTablePreferencesKey}).
   **/
  protected _tablePreferencesMap: Map<string, TableClientUiPreferencesDo>;
  protected _dirty: boolean;

  // --------------------------------------

  constructor() {
    this._dirty = false;
  }

  init(model: InitModelOf<this>) {
    Object.assign(this, model);
  }

  bootstrap(): JQuery.Promise<void> {
    return this.load();
  }

  load(): JQuery.Promise<void> {
    return $.when(this._load());
  }

  store(): JQuery.Promise<void> {
    return $.when(this._store());
  }

  markDirty(): boolean {
    if (this._dirty) {
      return false;
    }
    this._dirty = true;
    // Don't store immediately so we can coalesce multiple changes
    setTimeout(() => {
      this._dirty = false;
      this.store();
    });
    return true;
  }

  protected async _load(): Promise<void> {
    let json = webstorage.getItemFromLocalStorage(`scout:tablePreferences:${window.location.pathname}`);
    let tablePreferences = dataObjects.parse(json, Array<TableClientUiPreferencesDo>);
    this._setTablePreferences(tablePreferences);
  }

  protected async _store(): Promise<void> {
    let json = dataObjects.stringify(this._tablePreferences);
    webstorage.setItemToLocalStorage(`scout:tablePreferences:${window.location.pathname}`, json);
  }

  protected _setTablePreferences(tablePreferences: TableClientUiPreferencesDo[]) {
    this._tablePreferences = tablePreferences ?? [];
    this._tablePreferencesMap = new Map();
    this._tablePreferences.forEach(prefs => {
      let tableId = prefs.tableId;
      let userPreferenceContext = prefs.userPreferenceContext;
      let key = this._computeTablePreferencesKey(tableId, userPreferenceContext);

      this._tablePreferencesMap.set(key, prefs);
    });
  }

  protected _computeTablePreferencesKey(tableId: string, userPreferenceContext: string): string {
    return strings.join('#', tableId, userPreferenceContext);
  }

  protected _isValidProfileId(profileId: string): boolean {
    return !!profileId && !scout.isOneOf(profileId, ClientUiPreferences.TABLE_PREFERENCE_PROFILE_ID_GLOBAL, ClientUiPreferences.TABLE_PREFERENCE_PROFILE_ID_BOOKMARK);
  }

  // --------------------------------------

  getTablePreferences(table: Table): TableClientUiPreferencesDo {
    scout.assertParameter('table', table);
    let tableId = table.buildUuidPath();
    // FIXME [js-preferences] add userPreferenceContext to Table
    let userPreferenceContext = table.userPreferenceContext;
    let key = this._computeTablePreferencesKey(tableId, userPreferenceContext);

    return this._tablePreferencesMap.get(key);
  }

  getOrCreateTablePreferences(table: Table): TableClientUiPreferencesDo {
    scout.assertParameter('table', table);
    let tableId = table.buildUuidPath();
    let userPreferenceContext = table.userPreferenceContext;
    let key = this._computeTablePreferencesKey(tableId, userPreferenceContext);

    let prefs = this._tablePreferencesMap.get(key);
    if (!prefs) {
      prefs = scout.create(TableClientUiPreferencesDo, {tableId, userPreferenceContext});
      this._tablePreferences.push(prefs);
      this._tablePreferencesMap.set(key, prefs);
      this.markDirty();
    }
    return prefs;
  }

  getTablePreferencesProfile(prefsOrTable: TableClientUiPreferencesDo | Table, profileId: string): TableClientUiPreferenceProfileDo {
    let prefs = prefsOrTable instanceof Table ? this.getTablePreferences(prefsOrTable) : prefsOrTable;
    return prefs?.tablePreferenceProfiles?.get(profileId || ClientUiPreferences.TABLE_PREFERENCE_PROFILE_ID_GLOBAL);
  }

  createTablePreferenceProfile(table: Table): TableClientUiPreferenceProfileDo {
    let columnPreferences = this.getColumnPreferences(table);
    let userFilters = this.getUserFilters(table);
    let customizerData = this.getCustomizerData(table);

    return scout.create(TableClientUiPreferenceProfileDo, {
      columns: arrays.nullIfEmpty(columnPreferences) || undefined,
      userFilters: arrays.nullIfEmpty(userFilters) || undefined,
      tableCustomizerData: customizerData || undefined
    });
  }

  getColumnPreferences(table: Table): TableColumnClientUiPreferenceDo[] {
    scout.assertParameter('table', table);
    return table.columns.map((column, index) => {
      return scout.create(TableColumnClientUiPreferenceDo, {
        columnId: column.buildUuid(),
        width: column.width,
        viewIndex: index,
        sortOrder: column.sortIndex,
        sortAscending: column.sortAscending,
        visible: column.visible,
        groupingActive: column.grouped,
        // FIXME bsh [js-preferences] Delegate to column?
        aggregationFunctionId: (column instanceof NumberColumn ? column.aggregationFunction : null) || undefined,
        backgroundEffectId: (column instanceof NumberColumn ? column.backgroundEffect : null) || undefined
      });
    });
  }

  getUserFilters(table: Table): IUserFilterStateDo[] {
    scout.assertParameter('table', table);
    return table.filters
      .filter(filter => filter instanceof TableUserFilter)
      .map((filter: TableUserFilter) => {
        for (let mapper of UserFilterStateMappers.all()) {
          let filterState = mapper.tryToDo(table, filter);
          if (filterState) {
            return filterState;
          }
        }
        console.warn(`Unable to map filter to data object [table=${table.id}, filterType=${filter?.filterType}, filterLabel=${filter?.createLabel()}`);
        return null;
      })
      .filter(Boolean);
  }

  getCustomizerData(table: Table): ITableCustomizerDo {
    scout.assertParameter('table', table);
    // FIXME bsh [js-preferences] Implement
    return null;
  }

  // --------------------------------------

  applyTablePreferences(table: Table, profileId: string) {
    let prefs = this.getTablePreferences(table);

    // FIXME bsh [js-preferences] Reset table to initial state
    //       - remove all custom columns
    //       - reset all columns to their initial state
    //       - ONLY if profileId == GLOBAL: reset filters

    if (!prefs) {
      return;
    }

    table.setTileMode(scout.nvl(prefs.tileMode, false));
    // FIXME bsh [js-preferences] prefs.tileGlobalKey???

    let profile = this.getTablePreferencesProfile(prefs, profileId);
    if (!profile) {
      return;
    }

    if (table.isCustomizable()) {
      // FIXME bsh [js-preferences] Set tableCustomizerData to table.customizer
    }

    // FIXME bsh [js-preferences] Apply prefs to table (excluding filters!)
  }

  putTablePreferenceProfile(table: Table, profileId: string, profile: TableClientUiPreferenceProfileDo) {
    if (!this._isValidProfileId(profileId) || !profile) {
      return;
    }

    let prefs = this.getOrCreateTablePreferences(table);
    prefs.tablePreferenceProfiles = prefs.tablePreferenceProfiles || new Map();
    prefs.tablePreferenceProfiles.set(profileId, profile);

    this.markDirty();
  }

  renameTablePreferenceProfile(table: Table, oldProfileId: string, newProfileId: string) {
    if (!this._isValidProfileId(oldProfileId) || !this._isValidProfileId(newProfileId)) {
      return;
    }

    let prefs = this.getTablePreferences(table);
    let profile = prefs.tablePreferenceProfiles?.get(oldProfileId);
    if (profile) {
      prefs.tablePreferenceProfiles.set(newProfileId, profile);
      prefs.tablePreferenceProfiles.delete(oldProfileId);
      this.markDirty();
    }
  }

  removeTablePreferenceProfile(table: Table, profileId: string) {
    if (!this._isValidProfileId(profileId)) {
      return;
    }

    let prefs = this.getTablePreferences(table);
    let profile = prefs.tablePreferenceProfiles?.get(profileId);
    if (profile) {
      prefs.tablePreferenceProfiles.delete(profileId);
      this.markDirty();
    }
  }
}

export const clientUiPreferences: ClientUiPreferences = objects.createSingletonProxy(ClientUiPreferences);
