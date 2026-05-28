"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Boxes,
  PackagePlus,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import {
  adjustStock,
  createCategory,
  createProduct,
  createService,
  listCatalogItems,
  listCategories,
  listStock,
  listStockMovements,
  receiveStock,
  updateProduct,
  updateService,
  updateStockAlert,
  type BranchStock,
  type CatalogItem,
  type CatalogItemKind,
  type CatalogItemStatus,
  type CurrentUserResponse,
  type ItemCategory,
  type StockMovement,
} from "../../../lib/api";
import type { AppAccess } from "../app-permissions";
import { StatusBadge } from "../../status-badge";
import { SuppliersPanel } from "./suppliers-panel";
import { StockTransfersPanel } from "./stock-transfers-panel";

const STOCK_PAGE_SIZE = 6;
const CATALOG_PAGE_SIZE = 6;
const HISTORY_PAGE_SIZE = 5;

type ProductForm = {
  name: string;
  description: string;
  categoryId: string;
  sku: string;
  barcode: string;
  sellingPrice: string;
  costPrice: string;
  trackStock: boolean;
  lowStockAlertQuantity: string;
  startingStockQuantity: string;
  note: string;
};

type ServiceForm = {
  name: string;
  description: string;
  categoryId: string;
  serviceCode: string;
  sellingPrice: string;
  costEstimate: string;
  durationMinutes: string;
  note: string;
};

type CategoryForm = {
  name: string;
  description: string;
};

type ReceiveForm = {
  branchId: string;
  itemId: string;
  quantity: string;
  reference: string;
  note: string;
};

type AdjustForm = {
  branchId: string;
  itemId: string;
  adjustmentType:
    | "COUNT_CORRECTION"
    | "DAMAGED_REPORTED"
    | "DAMAGED_RESTORED"
    | "MISSING_REPORTED"
    | "STOLEN_REPORTED";
  quantity: string;
  countedAvailableQuantity: string;
  reference: string;
  note: string;
};

type AlertForm = {
  branchId: string;
  itemId: string;
  branchName: string;
  itemName: string;
  availableQuantity: number;
  lowStockAlertQuantity: string;
};

type EditForm = {
  name: string;
  description: string;
  categoryId: string;
  skuOrCode: string;
  barcode: string;
  sellingPrice: string;
  costAmount: string;
  durationMinutes: string;
  trackStock: boolean;
  lowStockAlertQuantity: string;
  status: CatalogItemStatus;
  priceChangeReason: string;
};

type DrawerMode =
  | "details"
  | "product"
  | "service"
  | "category"
  | "receive"
  | "adjust"
  | "alert"
  | "edit"
  | null;

type ActiveTab = "stock" | "catalog" | "suppliers" | "transfers" | "history";

type StockViewProps = {
  context: CurrentUserResponse;
  appAccess: AppAccess;
};

const initialProductForm: ProductForm = {
  name: "",
  description: "",
  categoryId: "",
  sku: "",
  barcode: "",
  sellingPrice: "",
  costPrice: "",
  trackStock: true,
  lowStockAlertQuantity: "0",
  startingStockQuantity: "0",
  note: "",
};

const initialServiceForm: ServiceForm = {
  name: "",
  description: "",
  categoryId: "",
  serviceCode: "",
  sellingPrice: "",
  costEstimate: "",
  durationMinutes: "",
  note: "",
};

const initialCategoryForm: CategoryForm = {
  name: "",
  description: "",
};

export function StockView({ context, appAccess }: StockViewProps) {
  const mainBranch = context.branches.find((branch) => branch.is_main);
  const firstBranch = mainBranch || context.branches[0];
  const defaultBranchId = firstBranch?.id || "";

  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [stock, setStock] = useState<BranchStock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    appAccess.usesStock ? "stock" : "catalog",
  );
  const [catalogFilter, setCatalogFilter] = useState<"ALL" | CatalogItemKind>(
    getDefaultCatalogFilter(appAccess),
  );
  const [search, setSearch] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranchId);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);

  const [visibleStockCount, setVisibleStockCount] = useState(STOCK_PAGE_SIZE);
  const [visibleCatalogCount, setVisibleCatalogCount] =
    useState(CATALOG_PAGE_SIZE);
  const [visibleMovementCount, setVisibleMovementCount] =
    useState(HISTORY_PAGE_SIZE);

  const [inventoryPanelRefreshKey, setInventoryPanelRefreshKey] = useState(0);

  const [productForm, setProductForm] =
    useState<ProductForm>(initialProductForm);
  const [serviceForm, setServiceForm] =
    useState<ServiceForm>(initialServiceForm);
  const [categoryForm, setCategoryForm] =
    useState<CategoryForm>(initialCategoryForm);

  const [receiveForm, setReceiveForm] = useState<ReceiveForm>({
    branchId: defaultBranchId,
    itemId: "",
    quantity: "",
    reference: "",
    note: "",
  });

  const [adjustForm, setAdjustForm] = useState<AdjustForm>({
    branchId: defaultBranchId,
    itemId: "",
    adjustmentType: "DAMAGED_REPORTED",
    quantity: "",
    countedAvailableQuantity: "",
    reference: "",
    note: "",
  });

  const [alertForm, setAlertForm] = useState<AlertForm | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [isReceivingStock, setIsReceivingStock] = useState(false);
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);
  const [isUpdatingAlert, setIsUpdatingAlert] = useState(false);
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const stockProducts = useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind === "PRODUCT" &&
          item.trackStock &&
          item.status === "active",
      ),
    [items],
  );

  const stockSummary = useMemo(() => {
    return stock.reduce(
      (result, row) => {
        result.totalOnHand += row.quantityOnHand;
        result.totalAvailable += row.quantityAvailable;
        result.totalDamaged += row.quantityDamaged;

        if (row.isLowStock) {
          result.lowStockCount += 1;
        }

        return result;
      },
      {
        totalOnHand: 0,
        totalAvailable: 0,
        totalDamaged: 0,
        lowStockCount: 0,
      },
    );
  }, [stock]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!appAccess.sellsProducts && item.kind === "PRODUCT") {
        return false;
      }

      if (!appAccess.sellsServices && item.kind === "SERVICE") {
        return false;
      }

      if (catalogFilter !== "ALL" && item.kind !== catalogFilter) {
        return false;
      }

      const value = `${item.name} ${item.sku || ""} ${item.barcode || ""}`
        .toLowerCase()
        .trim();

      return value.includes(search.toLowerCase().trim());
    });
  }, [
    appAccess.sellsProducts,
    appAccess.sellsServices,
    catalogFilter,
    items,
    search,
  ]);

  const latestMovement = movements[0];

  const canViewSuppliers =
    appAccess.usesStock &&
    context.membership.permissions.includes("SUPPLIER_VIEW");

  const canManageSuppliers =
    appAccess.usesStock &&
    (context.membership.permissions.includes("SUPPLIER_CREATE") ||
      context.membership.permissions.includes("SUPPLIER_UPDATE"));

  const canViewTransfers =
    appAccess.usesStock &&
    context.membership.permissions.includes("STOCK_TRANSFER_VIEW");

  const canCreateTransfer =
    appAccess.usesStock &&
    context.membership.permissions.includes("STOCK_TRANSFER_CREATE");

  useEffect(() => {
    if (!appAccess.usesStock && activeTab !== "catalog") {
      setActiveTab("catalog");
      return;
    }

    if (activeTab === "suppliers" && !canViewSuppliers) {
      setActiveTab(appAccess.usesStock ? "stock" : "catalog");
      return;
    }

    if (activeTab === "transfers" && !canViewTransfers) {
      setActiveTab(appAccess.usesStock ? "stock" : "catalog");
    }
  }, [activeTab, appAccess.usesStock, canViewSuppliers, canViewTransfers]);

  useEffect(() => {
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setVisibleStockCount(STOCK_PAGE_SIZE);
    setVisibleCatalogCount(CATALOG_PAGE_SIZE);
    setVisibleMovementCount(HISTORY_PAGE_SIZE);
  }, [activeTab, catalogFilter, search, selectedBranchId]);

  async function reloadAll() {
    setIsLoading(true);
    setError("");

    try {
      const itemParams: {
        kind?: CatalogItemKind;
        search?: string;
      } = {};

      if (appAccess.businessType === "product") {
        itemParams.kind = "PRODUCT";
      }

      if (appAccess.businessType === "service") {
        itemParams.kind = "SERVICE";
      }

      if (
        appAccess.businessType === "product_and_service" &&
        catalogFilter !== "ALL"
      ) {
        itemParams.kind = catalogFilter;
      }

      if (search.trim()) {
        itemParams.search = search.trim();
      }

      const [categoryResult, itemResult] = await Promise.all([
        listCategories(),
        listCatalogItems(itemParams),
      ]);

      setCategories(categoryResult.categories);
      setItems(itemResult.items);

      if (!appAccess.usesStock) {
        setStock([]);
        setMovements([]);
        return;
      }

      const stockParams: {
        branchId?: string;
        search?: string;
      } = {};

      if (selectedBranchId) {
        stockParams.branchId = selectedBranchId;
      }

      if (search.trim()) {
        stockParams.search = search.trim();
      }

      const movementParams: {
        branchId?: string;
      } = {};

      if (selectedBranchId) {
        movementParams.branchId = selectedBranchId;
      }

      const [stockResult, movementResult] = await Promise.all([
        listStock(stockParams),
        listStockMovements(movementParams),
      ]);

      setStock(stockResult.stock);
      setMovements(movementResult.movements);

      const firstProduct = itemResult.items.find(
        (item) =>
          item.kind === "PRODUCT" &&
          item.trackStock &&
          item.status === "active",
      );

      if (firstProduct) {
        setReceiveForm((current) => ({
          ...current,
          itemId: current.itemId || firstProduct.id,
        }));

        setAdjustForm((current) => ({
          ...current,
          itemId: current.itemId || firstProduct.id,
        }));
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `Could not load ${appAccess.catalogLabel.toLowerCase()}.`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerMode(null);
  }

  function openItemDetails(item: CatalogItem) {
    setSelectedItem(item);
    setDrawerMode("details");
  }

  function openReceiveDrawer(item?: CatalogItem) {
    if (!appAccess.usesStock) {
      return;
    }

    setReceiveForm((current) => ({
      ...current,
      branchId: selectedBranchId || defaultBranchId,
      itemId: item?.id || current.itemId || stockProducts[0]?.id || "",
    }));
    setDrawerMode("receive");
  }

  function openAdjustDrawer(item?: CatalogItem) {
    if (!appAccess.usesStock) {
      return;
    }

    setAdjustForm((current) => ({
      ...current,
      branchId: selectedBranchId || defaultBranchId,
      itemId: item?.id || current.itemId || stockProducts[0]?.id || "",
    }));
    setDrawerMode("adjust");
  }

  function openAlertDrawer(row: BranchStock) {
    if (!appAccess.usesStock) {
      return;
    }

    setAlertForm({
      branchId: row.branchId,
      itemId: row.itemId,
      branchName: row.branchName,
      itemName: row.itemName,
      availableQuantity: row.quantityAvailable,
      lowStockAlertQuantity: String(row.lowStockAlertQuantity),
    });
    setDrawerMode("alert");
  }

  function openEditItem(item: CatalogItem) {
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      description: item.description || "",
      categoryId: item.categoryId || "",
      skuOrCode: item.sku || "",
      barcode: item.barcode || "",
      sellingPrice: fromCents(item.sellingPriceCents),
      costAmount: fromCents(
        item.kind === "SERVICE"
          ? item.serviceCostEstimateCents
          : item.costPriceCents,
      ),
      durationMinutes: item.serviceDurationMinutes
        ? String(item.serviceDurationMinutes)
        : "",
      trackStock: item.trackStock,
      lowStockAlertQuantity: "",
      status: item.status,
      priceChangeReason: "",
    });
    setDrawerMode("edit");
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setIsCreatingCategory(true);

    try {
      const payload: Parameters<typeof createCategory>[0] = {
        name: categoryForm.name.trim(),
      };

      const description = categoryForm.description.trim();

      if (description) {
        payload.description = description;
      }

      await createCategory(payload);
      setCategoryForm(initialCategoryForm);
      setSuccess("Category created successfully.");
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create category.",
      );
    } finally {
      setIsCreatingCategory(false);
    }
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appAccess.canManageCatalog || !appAccess.sellsProducts) {
      setError("This business is not set up to create products.");
      return;
    }

    setError("");
    setSuccess("");
    setIsCreatingProduct(true);

    try {
      const payload: Parameters<typeof createProduct>[0] = {
        name: productForm.name.trim(),
        sellingPriceCents: toCents(productForm.sellingPrice),
        trackStock: productForm.trackStock,
      };

      const description = productForm.description.trim();
      const sku = productForm.sku.trim();
      const barcode = productForm.barcode.trim();
      const note = productForm.note.trim();

      if (description) payload.description = description;
      if (productForm.categoryId) payload.categoryId = productForm.categoryId;
      if (sku) payload.sku = sku;
      if (barcode) payload.barcode = barcode;

      if (productForm.costPrice.trim()) {
        payload.costPriceCents = toCents(productForm.costPrice);
      }

      if (productForm.lowStockAlertQuantity.trim()) {
        payload.lowStockAlertQuantity = toInt(
          productForm.lowStockAlertQuantity,
        );
      }

      if (
        productForm.trackStock &&
        defaultBranchId &&
        toInt(productForm.startingStockQuantity) > 0
      ) {
        payload.startingStock = [
          {
            branchId: defaultBranchId,
            quantity: toInt(productForm.startingStockQuantity),
          },
        ];
      }

      if (note) payload.note = note;

      await createProduct(payload);
      setProductForm(initialProductForm);
      setSuccess("Product created successfully.");
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create product.",
      );
    } finally {
      setIsCreatingProduct(false);
    }
  }

  async function handleCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appAccess.canManageCatalog || !appAccess.sellsServices) {
      setError("This business is not set up to create services.");
      return;
    }

    setError("");
    setSuccess("");
    setIsCreatingService(true);

    try {
      const payload: Parameters<typeof createService>[0] = {
        name: serviceForm.name.trim(),
        sellingPriceCents: toCents(serviceForm.sellingPrice),
      };

      const description = serviceForm.description.trim();
      const serviceCode = serviceForm.serviceCode.trim();
      const note = serviceForm.note.trim();

      if (description) payload.description = description;
      if (serviceForm.categoryId) payload.categoryId = serviceForm.categoryId;
      if (serviceCode) payload.serviceCode = serviceCode;

      if (serviceForm.costEstimate.trim()) {
        payload.costEstimateCents = toCents(serviceForm.costEstimate);
      }

      if (serviceForm.durationMinutes.trim()) {
        payload.durationMinutes = toInt(serviceForm.durationMinutes);
      }

      if (note) payload.note = note;

      await createService(payload);
      setServiceForm(initialServiceForm);
      setSuccess("Service created successfully.");
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create service.",
      );
    } finally {
      setIsCreatingService(false);
    }
  }

  async function handleReceiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appAccess.canMoveStock || !appAccess.usesStock) {
      setError("This business does not use stock.");
      return;
    }

    setError("");
    setSuccess("");
    setIsReceivingStock(true);

    try {
      const payload: Parameters<typeof receiveStock>[0] = {
        branchId: receiveForm.branchId,
        itemId: receiveForm.itemId,
        quantity: toInt(receiveForm.quantity),
      };

      const reference = receiveForm.reference.trim();
      const note = receiveForm.note.trim();

      if (reference) payload.reference = reference;
      if (note) payload.note = note;

      await receiveStock(payload);
      setReceiveForm((current) => ({
        ...current,
        quantity: "",
        reference: "",
        note: "",
      }));
      setSuccess("Stock received successfully.");
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not receive stock.",
      );
    } finally {
      setIsReceivingStock(false);
    }
  }

  async function handleAdjustStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appAccess.canMoveStock || !appAccess.usesStock) {
      setError("This business does not use stock.");
      return;
    }

    setError("");
    setSuccess("");
    setIsAdjustingStock(true);

    try {
      if (adjustForm.adjustmentType === "COUNT_CORRECTION") {
        const payload: Parameters<typeof adjustStock>[0] = {
          branchId: adjustForm.branchId,
          itemId: adjustForm.itemId,
          adjustmentType: "COUNT_CORRECTION",
          countedAvailableQuantity: toInt(adjustForm.countedAvailableQuantity),
          note: adjustForm.note.trim(),
        };

        const reference = adjustForm.reference.trim();

        if (reference) payload.reference = reference;

        await adjustStock(payload);
      } else {
        const payload: Parameters<typeof adjustStock>[0] = {
          branchId: adjustForm.branchId,
          itemId: adjustForm.itemId,
          adjustmentType: adjustForm.adjustmentType,
          quantity: toInt(adjustForm.quantity),
          note: adjustForm.note.trim(),
        };

        const reference = adjustForm.reference.trim();

        if (reference) payload.reference = reference;

        await adjustStock(payload);
      }

      setAdjustForm((current) => ({
        ...current,
        quantity: "",
        countedAvailableQuantity: "",
        reference: "",
        note: "",
      }));
      setSuccess("Stock change recorded successfully.");
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not record stock change.",
      );
    } finally {
      setIsAdjustingStock(false);
    }
  }

  async function handleUpdateAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!alertForm) {
      return;
    }

    if (!appAccess.canMoveStock || !appAccess.usesStock) {
      setError("This business does not use stock.");
      return;
    }

    setError("");
    setSuccess("");
    setIsUpdatingAlert(true);

    try {
      await updateStockAlert({
        branchId: alertForm.branchId,
        itemId: alertForm.itemId,
        lowStockAlertQuantity: toInt(alertForm.lowStockAlertQuantity),
      });

      setSuccess("Low stock alert updated successfully.");
      setAlertForm(null);
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update the low stock alert.",
      );
    } finally {
      setIsUpdatingAlert(false);
    }
  }

  async function handleUpdateSelectedItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItem || !editForm) {
      return;
    }

    if (!appAccess.canManageCatalog) {
      setError("You do not have access to update records.");
      return;
    }

    if (selectedItem.kind === "PRODUCT" && !appAccess.sellsProducts) {
      setError("This business is not set up to update products.");
      return;
    }

    if (selectedItem.kind === "SERVICE" && !appAccess.sellsServices) {
      setError("This business is not set up to update services.");
      return;
    }

    setError("");
    setSuccess("");
    setIsUpdatingItem(true);

    try {
      if (selectedItem.kind === "PRODUCT") {
        const payload: Parameters<typeof updateProduct>[1] = {
          name: editForm.name.trim(),
          sellingPriceCents: toCents(editForm.sellingPrice),
          trackStock: editForm.trackStock,
          status: editForm.status,
        };

        const description = editForm.description.trim();
        const sku = editForm.skuOrCode.trim();
        const barcode = editForm.barcode.trim();
        const priceChangeReason = editForm.priceChangeReason.trim();

        if (description) payload.description = description;
        if (editForm.categoryId) payload.categoryId = editForm.categoryId;
        if (sku) payload.sku = sku;
        if (barcode) payload.barcode = barcode;

        if (editForm.costAmount.trim()) {
          payload.costPriceCents = toCents(editForm.costAmount);
        }

        if (priceChangeReason) payload.priceChangeReason = priceChangeReason;

        await updateProduct(selectedItem.id, payload);
      } else {
        const payload: Parameters<typeof updateService>[1] = {
          name: editForm.name.trim(),
          sellingPriceCents: toCents(editForm.sellingPrice),
          status: editForm.status,
        };

        const description = editForm.description.trim();
        const serviceCode = editForm.skuOrCode.trim();
        const priceChangeReason = editForm.priceChangeReason.trim();

        if (description) payload.description = description;
        if (editForm.categoryId) payload.categoryId = editForm.categoryId;
        if (serviceCode) payload.serviceCode = serviceCode;

        if (editForm.costAmount.trim()) {
          payload.costEstimateCents = toCents(editForm.costAmount);
        }

        if (editForm.durationMinutes.trim()) {
          payload.durationMinutes = toInt(editForm.durationMinutes);
        }

        if (priceChangeReason) payload.priceChangeReason = priceChangeReason;

        await updateService(selectedItem.id, payload);
      }

      setSuccess("Record updated successfully.");
      closeDrawer();
      await reloadAll();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update this record.",
      );
    } finally {
      setIsUpdatingItem(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-28 lg:pb-8">
      <Hero
        appAccess={appAccess}
        summary={stockSummary}
        latestMovement={latestMovement}
        canManageCatalog={appAccess.canManageCatalog}
        canMoveStock={appAccess.canMoveStock}
        onAddProduct={() => setDrawerMode("product")}
        onAddService={() => setDrawerMode("service")}
        onReceiveStock={() => openReceiveDrawer()}
        onAdjustStock={() => openAdjustDrawer()}
      />

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      <section className="sticky top-0 z-20 -mx-4 border-y border-border bg-background/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-section lg:border lg:bg-surface lg:p-4 lg:shadow-card">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {appAccess.usesStock ? (
              <TabButton
                active={activeTab === "stock"}
                label="Stock"
                onClick={() => setActiveTab("stock")}
              />
            ) : null}

            <TabButton
              active={activeTab === "catalog"}
              label={getCatalogTabLabel(appAccess)}
              onClick={() => setActiveTab("catalog")}
            />

            {canViewSuppliers ? (
              <TabButton
                active={activeTab === "suppliers"}
                label="Suppliers"
                onClick={() => setActiveTab("suppliers")}
              />
            ) : null}

            {canViewTransfers ? (
              <TabButton
                active={activeTab === "transfers"}
                label="Transfers"
                onClick={() => setActiveTab("transfers")}
              />
            ) : null}

            {appAccess.usesStock ? (
              <TabButton
                active={activeTab === "history"}
                label="Stock history"
                onClick={() => setActiveTab("history")}
              />
            ) : null}
          </div>

          <div
            className={[
              "grid gap-2",
              appAccess.usesStock
                ? "md:grid-cols-[220px_1fr_auto]"
                : "md:grid-cols-[1fr_auto]",
            ].join(" ")}
          >
            {appAccess.usesStock ? (
              <select
                value={selectedBranchId}
                onChange={(event) => {
                  setSelectedBranchId(event.target.value);
                  setReceiveForm((current) => ({
                    ...current,
                    branchId: event.target.value,
                  }));
                  setAdjustForm((current) => ({
                    ...current,
                    branchId: event.target.value,
                  }));
                }}
                className="min-w-0 rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
              >
                {context.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void reloadAll();
                  }
                }}
                placeholder={getSearchPlaceholder(appAccess)}
                className="w-full min-w-0 rounded-2xl border border-border bg-background py-3 pl-9 pr-3 text-sm font-bold outline-none focus:border-primary"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                void reloadAll();
                setInventoryPanelRefreshKey((current) => current + 1);
              }}
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-muted-foreground transition hover:text-foreground"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      {isLoading ? <StockSkeleton /> : null}

      {!isLoading && activeTab === "stock" && appAccess.usesStock ? (
        <StockSection
          stock={stock}
          visibleCount={visibleStockCount}
          canMoveStock={appAccess.canMoveStock}
          onLoadMore={() =>
            setVisibleStockCount((current) => current + STOCK_PAGE_SIZE)
          }
          onReceiveStock={() => openReceiveDrawer()}
          onAdjustStock={() => openAdjustDrawer()}
          onUpdateAlert={openAlertDrawer}
          onOpenItem={(itemId) => {
            const item = items.find((candidate) => candidate.id === itemId);
            if (item) {
              openItemDetails(item);
            }
          }}
        />
      ) : null}

      {!isLoading && activeTab === "catalog" ? (
        <CatalogSection
          appAccess={appAccess}
          items={filteredItems}
          visibleCount={visibleCatalogCount}
          catalogFilter={catalogFilter}
          canManageCatalog={appAccess.canManageCatalog}
          onLoadMore={() =>
            setVisibleCatalogCount((current) => current + CATALOG_PAGE_SIZE)
          }
          onChangeCatalogFilter={setCatalogFilter}
          onAddCategory={() => setDrawerMode("category")}
          onAddProduct={() => setDrawerMode("product")}
          onAddService={() => setDrawerMode("service")}
          onEditItem={openEditItem}
          onOpenItem={openItemDetails}
        />
      ) : null}

      {!isLoading && activeTab === "history" && appAccess.usesStock ? (
        <MovementList
          movements={movements}
          visibleCount={visibleMovementCount}
          onLoadMore={() =>
            setVisibleMovementCount((current) => current + HISTORY_PAGE_SIZE)
          }
          onOpenItem={(itemId) => {
            const item = items.find((candidate) => candidate.id === itemId);
            if (item) {
              openItemDetails(item);
            }
          }}
        />
      ) : null}

      {activeTab === "suppliers" && canViewSuppliers ? (
        <SuppliersPanel
          search={search}
          refreshKey={inventoryPanelRefreshKey}
          canManageSuppliers={canManageSuppliers}
        />
      ) : null}

      {activeTab === "transfers" && canViewTransfers ? (
        <StockTransfersPanel
          search={search}
          refreshKey={inventoryPanelRefreshKey}
          branches={context.branches}
          canCreateTransfer={canCreateTransfer}
        />
      ) : null}

      <MobileActionBar
        appAccess={appAccess}
        canManageCatalog={appAccess.canManageCatalog}
        canMoveStock={appAccess.canMoveStock}
        onAddProduct={() => setDrawerMode("product")}
        onAddService={() => setDrawerMode("service")}
        onReceiveStock={() => openReceiveDrawer()}
        onAdjustStock={() => openAdjustDrawer()}
      />

      <Drawer
        open={drawerMode !== null}
        title={getDrawerTitle(drawerMode, selectedItem)}
        label={appAccess.catalogLabel}
        onClose={closeDrawer}
      >
        {drawerMode === "details" && selectedItem ? (
          <ItemDetailsView
            item={selectedItem}
            stock={stock.filter((row) => row.itemId === selectedItem.id)}
            movements={movements.filter(
              (movement) => movement.itemId === selectedItem.id,
            )}
            usesStock={appAccess.usesStock}
            canManageCatalog={appAccess.canManageCatalog}
            canMoveStock={
              appAccess.usesStock &&
              appAccess.canMoveStock &&
              selectedItem.kind === "PRODUCT"
            }
            onEdit={() => openEditItem(selectedItem)}
            onReceiveStock={() => openReceiveDrawer(selectedItem)}
            onAdjustStock={() => openAdjustDrawer(selectedItem)}
            onUpdateAlert={openAlertDrawer}
          />
        ) : null}

        {drawerMode === "category" ? (
          <CategoryFormView
            form={categoryForm}
            isLoading={isCreatingCategory}
            onChange={setCategoryForm}
            onSubmit={handleCreateCategory}
          />
        ) : null}

        {drawerMode === "product" && appAccess.sellsProducts ? (
          <ProductFormView
            form={productForm}
            categories={categories}
            isLoading={isCreatingProduct}
            onChange={setProductForm}
            onSubmit={handleCreateProduct}
          />
        ) : null}

        {drawerMode === "service" && appAccess.sellsServices ? (
          <ServiceFormView
            form={serviceForm}
            categories={categories}
            isLoading={isCreatingService}
            onChange={setServiceForm}
            onSubmit={handleCreateService}
          />
        ) : null}

        {drawerMode === "receive" && appAccess.usesStock ? (
          <ReceiveStockFormView
            form={receiveForm}
            products={stockProducts}
            branches={context.branches}
            isLoading={isReceivingStock}
            onChange={setReceiveForm}
            onSubmit={handleReceiveStock}
          />
        ) : null}

        {drawerMode === "adjust" && appAccess.usesStock ? (
          <AdjustStockFormView
            form={adjustForm}
            products={stockProducts}
            branches={context.branches}
            isLoading={isAdjustingStock}
            onChange={setAdjustForm}
            onSubmit={handleAdjustStock}
          />
        ) : null}

        {drawerMode === "alert" && alertForm && appAccess.usesStock ? (
          <StockAlertFormView
            form={alertForm}
            isLoading={isUpdatingAlert}
            onChange={setAlertForm}
            onSubmit={handleUpdateAlert}
          />
        ) : null}

        {drawerMode === "edit" && selectedItem && editForm ? (
          <EditItemFormView
            item={selectedItem}
            form={editForm}
            categories={categories}
            isLoading={isUpdatingItem}
            onChange={setEditForm}
            onSubmit={handleUpdateSelectedItem}
          />
        ) : null}
      </Drawer>
    </section>
  );
}

function Hero({
  appAccess,
  summary,
  latestMovement,
  canManageCatalog,
  canMoveStock,
  onAddProduct,
  onAddService,
  onReceiveStock,
  onAdjustStock,
}: {
  appAccess: AppAccess;
  summary: {
    totalOnHand: number;
    totalAvailable: number;
    totalDamaged: number;
    lowStockCount: number;
  };
  latestMovement: StockMovement | undefined;
  canManageCatalog: boolean;
  canMoveStock: boolean;
  onAddProduct: () => void;
  onAddService: () => void;
  onReceiveStock: () => void;
  onAdjustStock: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-surface shadow-card">
      <div className="relative p-5 sm:p-6 lg:p-7">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative space-y-6">
          <div className="max-w-3xl">
            <StatusBadge variant="success">
              {appAccess.businessType === "service"
                ? "Service control"
                : appAccess.businessType === "product_and_service"
                  ? "Products and services"
                  : "Product and stock control"}
            </StatusBadge>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              {getHeroTitle(appAccess)}
            </h1>
            <p className="mt-4 text-sm font-semibold leading-7 text-muted-foreground sm:text-base">
              {getHeroDescription(appAccess)}
            </p>
          </div>

          {appAccess.usesStock ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label="On hand" value={summary.totalOnHand} />
              <MetricCard label="Available" value={summary.totalAvailable} />
              <MetricCard label="Damaged" value={summary.totalDamaged} />
              <MetricCard label="Low stock" value={summary.lowStockCount} />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            {appAccess.usesStock ? (
              latestMovement ? (
                <div className="rounded-3xl border border-border bg-background/80 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Latest stock change
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">
                        {formatMovementType(latestMovement.movementType)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">
                        {latestMovement.itemName}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-border bg-background/80 p-4">
                  <p className="text-sm font-black">No stock changes yet</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">
                    Stock changes will appear after stock is created or updated.
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-3xl border border-border bg-background/80 p-4">
                <p className="text-sm font-black">Services only</p>
                <p className="mt-1 text-xs font-bold text-muted-foreground">
                  This business is set up to sell services, so stock controls
                  are hidden.
                </p>
              </div>
            )}

            <div className="hidden flex-wrap gap-2 lg:flex">
              {canManageCatalog && appAccess.sellsProducts ? (
                <HeroAction label="Add product" onClick={onAddProduct} />
              ) : null}

              {canManageCatalog && appAccess.sellsServices ? (
                <HeroAction label="Add service" onClick={onAddService} />
              ) : null}

              {canMoveStock && appAccess.usesStock ? (
                <>
                  <HeroAction label="Receive stock" onClick={onReceiveStock} />
                  <HeroAction label="Report issue" onClick={onAdjustStock} />
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
    >
      {label}
    </button>
  );
}

function StockSection({
  stock,
  visibleCount,
  canMoveStock,
  onLoadMore,
  onReceiveStock,
  onAdjustStock,
  onUpdateAlert,
  onOpenItem,
}: {
  stock: BranchStock[];
  visibleCount: number;
  canMoveStock: boolean;
  onLoadMore: () => void;
  onReceiveStock: () => void;
  onAdjustStock: () => void;
  onUpdateAlert: (row: BranchStock) => void;
  onOpenItem: (itemId: string) => void;
}) {
  const visibleStock = stock.slice(0, visibleCount);
  const hasMore = visibleCount < stock.length;

  return (
    <section className="space-y-4">
      {canMoveStock ? (
        <div className="hidden grid-cols-2 gap-3 lg:grid">
          <ActionCard
            icon={PackagePlus}
            title="Receive stock"
            description="Use this when new stock arrives at a selling location."
            buttonLabel="Receive stock"
            onClick={onReceiveStock}
          />
          <ActionCard
            icon={ShieldAlert}
            title="Record stock issue"
            description="Record damaged, restored, missing, stolen, or corrected stock."
            buttonLabel="Record issue"
            onClick={onAdjustStock}
          />
        </div>
      ) : (
        <PermissionCard message="You can view stock, but you cannot receive or change it." />
      )}

      <ListHeader
        title="Stock records"
        showing={visibleStock.length}
        total={stock.length}
      />

      <StockCards
        stock={visibleStock}
        canMoveStock={canMoveStock}
        onUpdateAlert={onUpdateAlert}
        onOpenItem={onOpenItem}
      />

      {hasMore ? (
        <LoadMoreButton
          label="Load more stock records"
          onClick={onLoadMore}
          showing={visibleStock.length}
          total={stock.length}
        />
      ) : null}
    </section>
  );
}

function CatalogSection({
  appAccess,
  items,
  visibleCount,
  catalogFilter,
  canManageCatalog,
  onLoadMore,
  onChangeCatalogFilter,
  onAddCategory,
  onAddProduct,
  onAddService,
  onEditItem,
  onOpenItem,
}: {
  appAccess: AppAccess;
  items: CatalogItem[];
  visibleCount: number;
  catalogFilter: "ALL" | CatalogItemKind;
  canManageCatalog: boolean;
  onLoadMore: () => void;
  onChangeCatalogFilter: (value: "ALL" | CatalogItemKind) => void;
  onAddCategory: () => void;
  onAddProduct: () => void;
  onAddService: () => void;
  onEditItem: (item: CatalogItem) => void;
  onOpenItem: (item: CatalogItem) => void;
}) {
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <section className="space-y-4">
      <div className="rounded-section border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="text-xl font-black">
              {getCatalogSectionTitle(appAccess)}
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {getCatalogSectionDescription(appAccess)}
            </p>
          </div>

          {appAccess.businessType === "product_and_service" ? (
            <div className="flex flex-wrap gap-2">
              {[
                ["ALL", "All"],
                ["PRODUCT", "Products"],
                ["SERVICE", "Services"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChangeCatalogFilter(value as "ALL" | CatalogItemKind)
                  }
                  className={[
                    "rounded-2xl px-3 py-2 text-xs font-black transition",
                    catalogFilter === value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {canManageCatalog ? (
          <div
            className={[
              "mt-4 grid gap-2",
              appAccess.sellsProducts && appAccess.sellsServices
                ? "sm:grid-cols-3"
                : "sm:grid-cols-2",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={onAddCategory}
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black"
            >
              Add category
            </button>

            {appAccess.sellsProducts ? (
              <button
                type="button"
                onClick={onAddProduct}
                className="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft"
              >
                Add product
              </button>
            ) : null}

            {appAccess.sellsServices ? (
              <button
                type="button"
                onClick={onAddService}
                className="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft"
              >
                Add service
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!canManageCatalog ? (
        <PermissionCard
          message={`You can view ${appAccess.catalogLabel.toLowerCase()}, but you cannot create or edit records.`}
        />
      ) : null}

      <ListHeader
        title={getCatalogSectionTitle(appAccess)}
        showing={visibleItems.length}
        total={items.length}
      />

      <CatalogList
        appAccess={appAccess}
        items={visibleItems}
        canManageCatalog={canManageCatalog}
        onEditItem={onEditItem}
        onOpenItem={onOpenItem}
      />

      {hasMore ? (
        <LoadMoreButton
          label={`Load more ${appAccess.catalogLabel.toLowerCase()}`}
          onClick={onLoadMore}
          showing={visibleItems.length}
          total={items.length}
        />
      ) : null}
    </section>
  );
}

function ListHeader({
  title,
  showing,
  total,
}: {
  title: string;
  showing: number;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-border bg-surface px-4 py-3 shadow-soft">
      <div>
        <p className="text-sm font-black">{title}</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          Showing {showing.toLocaleString()} of {total.toLocaleString()}
        </p>
      </div>
      {total > showing ? (
        <StatusBadge variant="primary">
          {(total - showing).toLocaleString()} more
        </StatusBadge>
      ) : (
        <StatusBadge variant="success">All shown</StatusBadge>
      )}
    </div>
  );
}

function LoadMoreButton({
  label,
  showing,
  total,
  onClick,
}: {
  label: string;
  showing: number;
  total: number;
  onClick: () => void;
}) {
  return (
    <div className="rounded-section border border-border bg-surface p-4 text-center shadow-card">
      <p className="text-sm font-bold text-muted-foreground">
        Showing {showing.toLocaleString()} of {total.toLocaleString()}
      </p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
      >
        {label}
      </button>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2.5 text-sm font-black transition",
        active
          ? "bg-primary text-primary-foreground shadow-soft"
          : "border border-border bg-background text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-3xl border border-border bg-background/80 p-4 shadow-soft">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value.toLocaleString()}</p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <article className="rounded-section border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft"
      >
        {buttonLabel}
      </button>
    </article>
  );
}

function StockCards({
  stock,
  canMoveStock,
  onUpdateAlert,
  onOpenItem,
}: {
  stock: BranchStock[];
  canMoveStock: boolean;
  onUpdateAlert: (row: BranchStock) => void;
  onOpenItem: (itemId: string) => void;
}) {
  if (!stock.length) {
    return (
      <EmptyState
        icon={Boxes}
        title="No stock records yet"
        description="Create a product with starting stock or receive stock into a selling location."
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {stock.map((row) => (
        <article
          key={row.id}
          className="rounded-[1.75rem] border border-border bg-surface p-4 shadow-card transition hover:border-primary/50 hover:bg-primary/5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-black">{row.itemName}</h3>
              <div className="mt-2 grid gap-1 text-xs font-bold text-muted-foreground">
                <span>Location: {row.branchName}</span>
                {row.sku ? <span>Product code: {row.sku}</span> : null}
                {row.barcode ? <span>Barcode: {row.barcode}</span> : null}
              </div>
            </div>
            {row.isLowStock ? (
              <StatusBadge variant="warning">Low stock</StatusBadge>
            ) : (
              <StatusBadge variant="success">Healthy</StatusBadge>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            <MiniMetric label="Available" value={row.quantityAvailable} />
            <MiniMetric label="Damaged" value={row.quantityDamaged} />
            <MiniMetric label="On hand" value={row.quantityOnHand} />
          </div>

          <div className="mt-4 grid gap-2">
            <DetailRow
              label="Selling price"
              value={money(row.sellingPriceCents)}
            />
            <DetailRow
              label="Alert when available reaches"
              value={
                row.lowStockAlertQuantity > 0
                  ? row.lowStockAlertQuantity.toLocaleString()
                  : "Alert off"
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <button
              type="button"
              onClick={() => onOpenItem(row.itemId)}
              className="rounded-2xl border border-border bg-background px-3 py-3 text-sm font-black text-foreground transition hover:border-primary/50"
            >
              Details
            </button>

            {canMoveStock ? (
              <button
                type="button"
                onClick={() => onUpdateAlert(row)}
                className="rounded-2xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
              >
                Update alert
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenItem(row.itemId)}
                className="rounded-2xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
              >
                Open
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function CatalogList({
  appAccess,
  items,
  canManageCatalog,
  onEditItem,
  onOpenItem,
}: {
  appAccess: AppAccess;
  items: CatalogItem[];
  canManageCatalog: boolean;
  onEditItem: (item: CatalogItem) => void;
  onOpenItem: (item: CatalogItem) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title={`No ${appAccess.catalogLabel.toLowerCase()} yet`}
        description={getEmptyCatalogDescription(appAccess)}
      />
    );
  }

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex min-h-full flex-col rounded-[1.75rem] border border-border bg-surface p-4 shadow-card transition hover:border-primary/50 hover:bg-primary/5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              variant={item.kind === "PRODUCT" ? "success" : "primary"}
            >
              {item.kind === "PRODUCT" ? "Product" : "Service"}
            </StatusBadge>
            <StatusBadge
              variant={item.status === "active" ? "success" : "warning"}
            >
              {item.status === "active" ? "Active" : "Paused"}
            </StatusBadge>
          </div>

          <button
            type="button"
            onClick={() => onOpenItem(item)}
            className="mt-4 block flex-1 text-left"
          >
            <h3 className="break-words text-xl font-black">{item.name}</h3>

            <div className="mt-3 grid gap-2 text-sm font-bold text-muted-foreground">
              <InfoLine
                label="Category"
                value={item.categoryName || "Not set"}
              />
              <InfoLine
                label={
                  item.kind === "PRODUCT" ? "Product code" : "Service code"
                }
                value={item.sku || "Not set"}
              />

              {item.kind === "PRODUCT" ? (
                <>
                  <InfoLine label="Barcode" value={item.barcode || "Not set"} />
                  <InfoLine
                    label="Stock tracking"
                    value={item.trackStock ? "On" : "Off"}
                  />
                </>
              ) : (
                <InfoLine
                  label="Time estimate"
                  value={
                    item.serviceDurationMinutes
                      ? `${item.serviceDurationMinutes} minutes`
                      : "Not set"
                  }
                />
              )}
            </div>

            {item.description ? (
              <p className="mt-4 line-clamp-3 text-sm font-semibold leading-6 text-muted-foreground">
                {item.description}
              </p>
            ) : null}

            <div className="mt-4 rounded-2xl border border-border bg-background p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Selling price
              </p>
              <p className="mt-1 text-2xl font-black">
                {money(item.sellingPriceCents)}
              </p>
            </div>
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenItem(item)}
              className="rounded-2xl border border-border bg-background px-3 py-3 text-sm font-black text-foreground"
            >
              Details
            </button>

            {canManageCatalog ? (
              <button
                type="button"
                onClick={() => onEditItem(item)}
                className="rounded-2xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground shadow-soft"
              >
                Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenItem(item)}
                className="rounded-2xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground shadow-soft"
              >
                Open
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function ItemDetailsView({
  item,
  stock,
  movements,
  usesStock,
  canManageCatalog,
  canMoveStock,
  onEdit,
  onReceiveStock,
  onAdjustStock,
  onUpdateAlert,
}: {
  item: CatalogItem;
  stock: BranchStock[];
  movements: StockMovement[];
  usesStock: boolean;
  canManageCatalog: boolean;
  canMoveStock: boolean;
  onEdit: () => void;
  onReceiveStock: () => void;
  onAdjustStock: () => void;
  onUpdateAlert: (row: BranchStock) => void;
}) {
  const totals = stock.reduce(
    (result, row) => {
      result.available += row.quantityAvailable;
      result.damaged += row.quantityDamaged;
      result.onHand += row.quantityOnHand;
      return result;
    },
    {
      available: 0,
      damaged: 0,
      onHand: 0,
    },
  );

  return (
    <div className="space-y-5">
      <section className="rounded-section border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            variant={item.kind === "PRODUCT" ? "success" : "primary"}
          >
            {item.kind === "PRODUCT" ? "Product" : "Service"}
          </StatusBadge>
          <StatusBadge
            variant={item.status === "active" ? "success" : "warning"}
          >
            {item.status === "active" ? "Active" : "Paused"}
          </StatusBadge>
        </div>

        <h3 className="mt-4 break-words text-2xl font-black">{item.name}</h3>

        {item.description ? (
          <p className="mt-3 text-sm font-semibold leading-7 text-muted-foreground">
            {item.description}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          <DetailRow label="Category" value={item.categoryName || "Not set"} />
          <DetailRow
            label="Selling price"
            value={money(item.sellingPriceCents)}
          />
          <DetailRow
            label={item.kind === "PRODUCT" ? "Cost price" : "Cost estimate"}
            value={
              item.kind === "PRODUCT"
                ? item.costPriceCents === null
                  ? "Not set"
                  : money(item.costPriceCents)
                : item.serviceCostEstimateCents === null
                  ? "Not set"
                  : money(item.serviceCostEstimateCents)
            }
          />
          <DetailRow
            label={item.kind === "PRODUCT" ? "Product code" : "Service code"}
            value={item.sku || "Not set"}
          />

          {item.kind === "PRODUCT" ? (
            <>
              <DetailRow label="Barcode" value={item.barcode || "Not set"} />
              <DetailRow
                label="Stock tracking"
                value={item.trackStock ? "On" : "Off"}
              />
            </>
          ) : null}

          {item.kind === "SERVICE" ? (
            <DetailRow
              label="Time estimate"
              value={
                item.serviceDurationMinutes
                  ? `${item.serviceDurationMinutes} minutes`
                  : "Not set"
              }
            />
          ) : null}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {canManageCatalog ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft"
            >
              Edit details
            </button>
          ) : null}

          {canMoveStock ? (
            <>
              <button
                type="button"
                onClick={onReceiveStock}
                className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground"
              >
                Receive stock
              </button>
              <button
                type="button"
                onClick={onAdjustStock}
                className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-black text-warning"
              >
                Report issue
              </button>
            </>
          ) : null}
        </div>
      </section>

      {item.kind === "PRODUCT" && usesStock ? (
        <section className="rounded-section border border-border bg-surface p-5">
          <h4 className="text-lg font-black">Stock by location</h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            Each selling location can have its own low stock alert.
          </p>

          {stock.length ? (
            <div className="mt-4 grid gap-3">
              {stock.map((row) => (
                <div
                  key={row.id}
                  className="rounded-3xl border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{row.branchName}</p>
                      <div className="mt-2 grid gap-1 text-xs font-bold text-muted-foreground">
                        <span>
                          Alert when available reaches:{" "}
                          {row.lowStockAlertQuantity > 0
                            ? row.lowStockAlertQuantity.toLocaleString()
                            : "Alert off"}
                        </span>
                        <span>
                          Available now:{" "}
                          {row.quantityAvailable.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {row.isLowStock ? (
                      <StatusBadge variant="warning">Low stock</StatusBadge>
                    ) : (
                      <StatusBadge variant="success">Healthy</StatusBadge>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
                    <MiniMetric
                      label="Available"
                      value={row.quantityAvailable}
                    />
                    <MiniMetric label="Damaged" value={row.quantityDamaged} />
                    <MiniMetric label="On hand" value={row.quantityOnHand} />
                  </div>

                  {canMoveStock ? (
                    <button
                      type="button"
                      onClick={() => onUpdateAlert(row)}
                      className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
                    >
                      Update alert
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
              No stock record exists yet for this product.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            <MiniMetric label="Available total" value={totals.available} />
            <MiniMetric label="Damaged total" value={totals.damaged} />
            <MiniMetric label="On hand total" value={totals.onHand} />
          </div>
        </section>
      ) : null}

      {item.kind === "PRODUCT" && usesStock ? (
        <section className="rounded-section border border-border bg-surface p-5">
          <h4 className="text-lg font-black">Recent activity</h4>

          {movements.length ? (
            <div className="mt-4 space-y-3">
              {movements.slice(0, 5).map((movement) => (
                <div
                  key={movement.id}
                  className="rounded-3xl border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <MovementBadge type={movement.movementType} />
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-black text-muted-foreground">
                      {new Date(movement.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm font-bold text-muted-foreground">
                    <span>Location: {movement.branchName}</span>
                    <span>Reason: {movement.reason || "Stock change"}</span>
                    {movement.actorName ? (
                      <span>Recorded by: {movement.actorName}</span>
                    ) : null}
                    {movement.reference ? (
                      <span>Reference: {movement.reference}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
              No recent stock activity for this product.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StockAlertFormView({
  form,
  isLoading,
  onChange,
  onSubmit,
}: {
  form: AlertForm;
  isLoading: boolean;
  onChange: (value: AlertForm | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const alertValue = toInt(form.lowStockAlertQuantity);
  const willBeLowStock = alertValue > 0 && form.availableQuantity <= alertValue;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className="rounded-section border border-border bg-surface p-5">
        <StatusBadge variant={willBeLowStock ? "warning" : "success"}>
          {willBeLowStock ? "Will show low stock" : "Healthy after update"}
        </StatusBadge>

        <h3 className="mt-4 break-words text-xl font-black">{form.itemName}</h3>

        <div className="mt-4 grid gap-3">
          <DetailRow label="Location" value={form.branchName} />
          <DetailRow
            label="Available now"
            value={form.availableQuantity.toLocaleString()}
          />
        </div>
      </section>

      <InputField
        label="Alert when available reaches"
        value={form.lowStockAlertQuantity}
        onChange={(value) =>
          onChange({
            ...form,
            lowStockAlertQuantity: value,
          })
        }
        type="number"
        min="0"
        required
      />

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm font-semibold leading-6 text-muted-foreground">
        Use 0 to turn off the alert for this location. Use a higher number for
        busy locations that need earlier restocking.
      </p>

      <SubmitButton
        label="Save stock alert"
        loadingLabel="Saving..."
        isLoading={isLoading}
      />
    </form>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid gap-0.5">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-sm font-black text-foreground">
        {value}
      </span>
    </span>
  );
}

function MovementList({
  movements,
  visibleCount,
  onLoadMore,
  onOpenItem,
}: {
  movements: StockMovement[];
  visibleCount: number;
  onLoadMore: () => void;
  onOpenItem: (itemId: string) => void;
}) {
  const visibleMovements = movements.slice(0, visibleCount);
  const hasMore = visibleCount < movements.length;

  if (!movements.length) {
    return (
      <EmptyState
        icon={Activity}
        title="No stock history yet"
        description="Receive stock or record a stock issue to create stock history."
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black">Stock history</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Review what changed, where it changed, who recorded it, and why.
            </p>
          </div>
          <StatusBadge variant="primary">
            {visibleMovements.length} shown
          </StatusBadge>
        </div>

        <div className="space-y-3">
          {visibleMovements.map((movement) => (
            <button
              key={movement.id}
              type="button"
              onClick={() => onOpenItem(movement.itemId)}
              className="block w-full rounded-[1.75rem] border border-border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="grid gap-4 xl:grid-cols-[1fr_330px] xl:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <MovementBadge type={movement.movementType} />
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-black text-muted-foreground">
                      {new Date(movement.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-lg font-black">
                    {movement.itemName}
                  </h3>
                  <div className="mt-2 grid gap-1 text-sm font-bold text-muted-foreground">
                    <span>Location: {movement.branchName}</span>
                    <span>Reason: {movement.reason || "Stock change"}</span>
                    {movement.reference ? (
                      <span>Reference: {movement.reference}</span>
                    ) : null}
                    {movement.actorName ? (
                      <span>Recorded by: {movement.actorName}</span>
                    ) : null}
                  </div>
                  {movement.note ? (
                    <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
                      {movement.note}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
                  <MovementMiniStat
                    label="Available"
                    before={movement.quantityAvailableBefore}
                    after={movement.quantityAvailableAfter}
                  />
                  <MovementMiniStat
                    label="Damaged"
                    before={movement.quantityDamagedBefore}
                    after={movement.quantityDamagedAfter}
                  />
                  <MovementMiniStat
                    label="On hand"
                    before={movement.quantityOnHandBefore}
                    after={movement.quantityOnHandAfter}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {hasMore ? (
        <LoadMoreButton
          label="Load more history"
          onClick={onLoadMore}
          showing={visibleMovements.length}
          total={movements.length}
        />
      ) : null}
    </section>
  );
}

function MobileActionBar({
  appAccess,
  canManageCatalog,
  canMoveStock,
  onAddProduct,
  onAddService,
  onReceiveStock,
  onAdjustStock,
}: {
  appAccess: AppAccess;
  canManageCatalog: boolean;
  canMoveStock: boolean;
  onAddProduct: () => void;
  onAddService: () => void;
  onReceiveStock: () => void;
  onAdjustStock: () => void;
}) {
  if (!canManageCatalog && !canMoveStock) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-xl gap-2">
        {canMoveStock && appAccess.usesStock ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onReceiveStock}
              className="rounded-2xl bg-primary px-3 py-3 text-xs font-black text-primary-foreground shadow-soft"
            >
              Receive stock
            </button>
            <button
              type="button"
              onClick={onAdjustStock}
              className="rounded-2xl border border-warning/30 bg-warning/10 px-3 py-3 text-xs font-black text-warning"
            >
              Report issue
            </button>
          </div>
        ) : null}

        {canManageCatalog ? (
          <div
            className={[
              "grid gap-2",
              appAccess.sellsProducts && appAccess.sellsServices
                ? "grid-cols-2"
                : "grid-cols-1",
            ].join(" ")}
          >
            {appAccess.sellsProducts ? (
              <button
                type="button"
                onClick={onAddProduct}
                className="rounded-2xl border border-border bg-surface px-3 py-3 text-xs font-black text-foreground"
              >
                Add product
              </button>
            ) : null}

            {appAccess.sellsServices ? (
              <button
                type="button"
                onClick={onAddService}
                className="rounded-2xl border border-border bg-surface px-3 py-3 text-xs font-black text-foreground"
              >
                Add service
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Drawer({
  open,
  title,
  label,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <aside className="rurix-scrollbar absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto border-l border-border bg-background shadow-2xl sm:max-w-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/95 p-5 backdrop-blur-xl">
          <div>
            <StatusBadge variant="primary">{label}</StatusBadge>
            <h2 className="mt-3 break-words text-2xl font-black">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border bg-surface p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

function CategoryFormView({
  form,
  isLoading,
  onChange,
  onSubmit,
}: {
  form: CategoryForm;
  isLoading: boolean;
  onChange: (value: CategoryForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <InputField
        label="Category name"
        value={form.name}
        onChange={(value) => onChange({ ...form, name: value })}
        required
      />
      <TextAreaField
        label="Description"
        value={form.description}
        onChange={(value) => onChange({ ...form, description: value })}
      />
      <SubmitButton
        label="Create category"
        loadingLabel="Creating..."
        isLoading={isLoading}
      />
    </form>
  );
}

function ProductFormView({
  form,
  categories,
  isLoading,
  onChange,
  onSubmit,
}: {
  form: ProductForm;
  categories: ItemCategory[];
  isLoading: boolean;
  onChange: (value: ProductForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <InputField
        label="Product name"
        value={form.name}
        onChange={(value) => onChange({ ...form, name: value })}
        required
      />
      <CategorySelect
        categories={categories}
        value={form.categoryId}
        onChange={(value) => onChange({ ...form, categoryId: value })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Selling price"
          value={form.sellingPrice}
          onChange={(value) => onChange({ ...form, sellingPrice: value })}
          type="number"
          min="0"
          required
        />
        <InputField
          label="Cost price"
          value={form.costPrice}
          onChange={(value) => onChange({ ...form, costPrice: value })}
          type="number"
          min="0"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Product code"
          value={form.sku}
          onChange={(value) => onChange({ ...form, sku: value })}
          placeholder="Auto-generated if empty"
        />
        <InputField
          label="Barcode"
          value={form.barcode}
          onChange={(value) => onChange({ ...form, barcode: value })}
        />
      </div>

      <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-extrabold">
        <span>Track stock for this product</span>
        <input
          type="checkbox"
          checked={form.trackStock}
          onChange={(event) =>
            onChange({ ...form, trackStock: event.target.checked })
          }
        />
      </label>

      {form.trackStock ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            label="Starting stock"
            value={form.startingStockQuantity}
            onChange={(value) =>
              onChange({ ...form, startingStockQuantity: value })
            }
            type="number"
            min="0"
          />
          <InputField
            label="Alert when stock reaches"
            value={form.lowStockAlertQuantity}
            onChange={(value) =>
              onChange({ ...form, lowStockAlertQuantity: value })
            }
            type="number"
            min="0"
          />
        </div>
      ) : null}

      <TextAreaField
        label="Description"
        value={form.description}
        onChange={(value) => onChange({ ...form, description: value })}
      />
      <TextAreaField
        label="Note"
        value={form.note}
        onChange={(value) => onChange({ ...form, note: value })}
      />
      <SubmitButton
        label="Create product"
        loadingLabel="Creating..."
        isLoading={isLoading}
      />
    </form>
  );
}

function ServiceFormView({
  form,
  categories,
  isLoading,
  onChange,
  onSubmit,
}: {
  form: ServiceForm;
  categories: ItemCategory[];
  isLoading: boolean;
  onChange: (value: ServiceForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <InputField
        label="Service name"
        value={form.name}
        onChange={(value) => onChange({ ...form, name: value })}
        required
      />
      <CategorySelect
        categories={categories}
        value={form.categoryId}
        onChange={(value) => onChange({ ...form, categoryId: value })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Selling price"
          value={form.sellingPrice}
          onChange={(value) => onChange({ ...form, sellingPrice: value })}
          type="number"
          min="0"
          required
        />
        <InputField
          label="Cost estimate"
          value={form.costEstimate}
          onChange={(value) => onChange({ ...form, costEstimate: value })}
          type="number"
          min="0"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Service code"
          value={form.serviceCode}
          onChange={(value) => onChange({ ...form, serviceCode: value })}
          placeholder="Auto-generated if empty"
        />
        <InputField
          label="Time estimate in minutes"
          value={form.durationMinutes}
          onChange={(value) => onChange({ ...form, durationMinutes: value })}
          type="number"
          min="1"
        />
      </div>
      <TextAreaField
        label="Description"
        value={form.description}
        onChange={(value) => onChange({ ...form, description: value })}
      />
      <TextAreaField
        label="Note"
        value={form.note}
        onChange={(value) => onChange({ ...form, note: value })}
      />
      <SubmitButton
        label="Create service"
        loadingLabel="Creating..."
        isLoading={isLoading}
      />
    </form>
  );
}

function ReceiveStockFormView({
  form,
  products,
  branches,
  isLoading,
  onChange,
  onSubmit,
}: {
  form: ReceiveForm;
  products: CatalogItem[];
  branches: CurrentUserResponse["branches"];
  isLoading: boolean;
  onChange: (value: ReceiveForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SelectField
        label="Location"
        value={form.branchId}
        onChange={(value) => onChange({ ...form, branchId: value })}
        options={branches.map((branch) => ({
          value: branch.id,
          label: branch.name,
        }))}
      />
      <SelectField
        label="Product"
        value={form.itemId}
        onChange={(value) => onChange({ ...form, itemId: value })}
        options={products.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
      />
      <InputField
        label="Quantity received"
        value={form.quantity}
        onChange={(value) => onChange({ ...form, quantity: value })}
        type="number"
        min="1"
        required
      />
      <InputField
        label="Reference"
        value={form.reference}
        onChange={(value) => onChange({ ...form, reference: value })}
        placeholder="Auto-generated if empty"
      />
      <TextAreaField
        label="Note"
        value={form.note}
        onChange={(value) => onChange({ ...form, note: value })}
        placeholder="Supplier, condition, or extra detail"
      />
      <SubmitButton
        label="Receive stock"
        loadingLabel="Receiving..."
        isLoading={isLoading}
      />
    </form>
  );
}

function AdjustStockFormView({
  form,
  products,
  branches,
  isLoading,
  onChange,
  onSubmit,
}: {
  form: AdjustForm;
  products: CatalogItem[];
  branches: CurrentUserResponse["branches"];
  isLoading: boolean;
  onChange: (value: AdjustForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SelectField
        label="Location"
        value={form.branchId}
        onChange={(value) => onChange({ ...form, branchId: value })}
        options={branches.map((branch) => ({
          value: branch.id,
          label: branch.name,
        }))}
      />
      <SelectField
        label="Product"
        value={form.itemId}
        onChange={(value) => onChange({ ...form, itemId: value })}
        options={products.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
      />
      <SelectField
        label="Action"
        value={form.adjustmentType}
        onChange={(value) =>
          onChange({
            ...form,
            adjustmentType: value as AdjustForm["adjustmentType"],
          })
        }
        options={[
          { value: "DAMAGED_REPORTED", label: "Report damaged stock" },
          { value: "DAMAGED_RESTORED", label: "Restore damaged stock" },
          { value: "MISSING_REPORTED", label: "Report missing stock" },
          { value: "STOLEN_REPORTED", label: "Report stolen stock" },
          { value: "COUNT_CORRECTION", label: "Count correction" },
        ]}
      />

      {form.adjustmentType === "COUNT_CORRECTION" ? (
        <InputField
          label="Counted available quantity"
          value={form.countedAvailableQuantity}
          onChange={(value) =>
            onChange({ ...form, countedAvailableQuantity: value })
          }
          type="number"
          min="0"
          required
        />
      ) : (
        <InputField
          label="Quantity"
          value={form.quantity}
          onChange={(value) => onChange({ ...form, quantity: value })}
          type="number"
          min="1"
          required
        />
      )}

      <InputField
        label="Reference"
        value={form.reference}
        onChange={(value) => onChange({ ...form, reference: value })}
        placeholder="Auto-generated if empty"
      />

      <TextAreaField
        label="Reason"
        value={form.note}
        onChange={(value) => onChange({ ...form, note: value })}
        placeholder="Explain what happened"
        required
      />

      <SubmitButton
        label="Record stock action"
        loadingLabel="Recording..."
        isLoading={isLoading}
      />
    </form>
  );
}

function EditItemFormView({
  item,
  form,
  categories,
  isLoading,
  onChange,
  onSubmit,
}: {
  item: CatalogItem;
  form: EditForm;
  categories: ItemCategory[];
  isLoading: boolean;
  onChange: (value: EditForm | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <InputField
        label="Name"
        value={form.name}
        onChange={(value) => onChange({ ...form, name: value })}
        required
      />
      <CategorySelect
        categories={categories}
        value={form.categoryId}
        onChange={(value) => onChange({ ...form, categoryId: value })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Selling price"
          value={form.sellingPrice}
          onChange={(value) => onChange({ ...form, sellingPrice: value })}
          type="number"
          min="0"
          required
        />
        <InputField
          label={item.kind === "PRODUCT" ? "Cost price" : "Cost estimate"}
          value={form.costAmount}
          onChange={(value) => onChange({ ...form, costAmount: value })}
          type="number"
          min="0"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label={item.kind === "PRODUCT" ? "Product code" : "Service code"}
          value={form.skuOrCode}
          onChange={(value) => onChange({ ...form, skuOrCode: value })}
          placeholder="Auto-generated if empty"
        />
        {item.kind === "PRODUCT" ? (
          <InputField
            label="Barcode"
            value={form.barcode}
            onChange={(value) => onChange({ ...form, barcode: value })}
          />
        ) : (
          <InputField
            label="Time estimate in minutes"
            value={form.durationMinutes}
            onChange={(value) => onChange({ ...form, durationMinutes: value })}
            type="number"
            min="1"
          />
        )}
      </div>

      {item.kind === "PRODUCT" ? (
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-extrabold">
          <span>Track stock</span>
          <input
            type="checkbox"
            checked={form.trackStock}
            onChange={(event) =>
              onChange({ ...form, trackStock: event.target.checked })
            }
          />
        </label>
      ) : null}

      <SelectField
        label="Status"
        value={form.status}
        onChange={(value) =>
          onChange({ ...form, status: value as CatalogItemStatus })
        }
        options={[
          { value: "active", label: "Active" },
          { value: "inactive", label: "Paused" },
        ]}
      />

      <TextAreaField
        label="Description"
        value={form.description}
        onChange={(value) => onChange({ ...form, description: value })}
      />

      <TextAreaField
        label="Price change reason"
        value={form.priceChangeReason}
        onChange={(value) => onChange({ ...form, priceChangeReason: value })}
        placeholder="Explain why the price changed"
      />

      <SubmitButton
        label="Save changes"
        loadingLabel="Saving..."
        isLoading={isLoading}
      />
    </form>
  );
}

function MovementBadge({ type }: { type: StockMovement["movementType"] }) {
  return (
    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
      {formatMovementType(type)}
    </span>
  );
}

function MovementMiniStat({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xs font-black sm:text-sm">
        {before.toLocaleString()} → {after.toLocaleString()}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-black">{value.toLocaleString()}</p>
    </div>
  );
}

function PermissionCard({ message }: { message: string }) {
  return (
    <div className="rounded-section border border-warning/25 bg-warning/10 p-5 text-sm font-bold leading-6 text-warning">
      {message}
    </div>
  );
}

function AlertCard({
  tone,
  message,
}: {
  tone: "success" | "danger";
  message: string;
}) {
  return (
    <div
      className={[
        "rounded-panel border px-4 py-3 text-sm font-bold",
        tone === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-section border border-dashed border-border bg-surface p-8 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

function StockSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-section border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        rows={4}
        className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      >
        <option value="">Choose</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: ItemCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      label="Category"
      value={value}
      onChange={onChange}
      options={categories
        .filter((category) => category.status === "active")
        .map((category) => ({
          value: category.id,
          label: category.name,
        }))}
    />
  );
}

function SubmitButton({
  label,
  loadingLabel,
  isLoading,
}: {
  label: string;
  loadingLabel: string;
  isLoading: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
      ) : null}
      {isLoading ? loadingLabel : label}
    </button>
  );
}

function getDrawerTitle(mode: DrawerMode, selectedItem: CatalogItem | null) {
  if (mode === "details") return selectedItem ? selectedItem.name : "Details";
  if (mode === "product") return "Add product";
  if (mode === "service") return "Add service";
  if (mode === "category") return "Add category";
  if (mode === "receive") return "Receive stock";
  if (mode === "adjust") return "Record stock issue";
  if (mode === "alert") return "Update stock alert";
  if (mode === "edit") {
    return selectedItem ? `Edit ${selectedItem.name}` : "Edit record";
  }

  return "";
}

function formatMovementType(type: StockMovement["movementType"]) {
  const labels: Record<StockMovement["movementType"], string> = {
    INITIAL_STOCK: "Starting stock",
    STOCK_RECEIVED: "Stock received",
    COUNT_CORRECTION: "Count corrected",
    DAMAGED_REPORTED: "Damaged reported",
    DAMAGED_RESTORED: "Damaged restored",
    MISSING_REPORTED: "Missing reported",
    STOLEN_REPORTED: "Stolen reported",
    STOCK_TRANSFER_OUT: "Stock moved out",
    STOCK_TRANSFER_IN: "Stock moved in",
  };

  return labels[type];
}

function getDefaultCatalogFilter(
  appAccess: AppAccess,
): "ALL" | CatalogItemKind {
  if (appAccess.businessType === "product") return "PRODUCT";
  if (appAccess.businessType === "service") return "SERVICE";

  return "ALL";
}

function getCatalogTabLabel(appAccess: AppAccess) {
  if (appAccess.businessType === "product") return "Products";
  if (appAccess.businessType === "service") return "Services";

  return "Products & services";
}

function getHeroTitle(appAccess: AppAccess) {
  if (appAccess.businessType === "service") {
    return "Services your business sells";
  }

  if (appAccess.businessType === "product_and_service") {
    return "Products, services, and stock truth";
  }

  return "Products and stock truth";
}

function getHeroDescription(appAccess: AppAccess) {
  if (appAccess.businessType === "service") {
    return "Create services, set prices, estimate time, and keep the service catalog clean without showing stock controls.";
  }

  if (appAccess.businessType === "product_and_service") {
    return "Create products and services separately. Receive stock for products, record issues, and keep every change easy to review.";
  }

  return "Create products, receive new stock, record damaged or missing items, and keep every stock change easy to review.";
}

function getCatalogSectionTitle(appAccess: AppAccess) {
  if (appAccess.businessType === "product") return "Products";
  if (appAccess.businessType === "service") return "Services";

  return "Products & services";
}

function getCatalogSectionDescription(appAccess: AppAccess) {
  if (appAccess.businessType === "product") {
    return "Manage the physical products the business sells and tracks in stock.";
  }

  if (appAccess.businessType === "service") {
    return "Manage the services the business sells without stock tracking.";
  }

  return "Manage what the business sells: products with stock and services without stock.";
}

function getSearchPlaceholder(appAccess: AppAccess) {
  if (appAccess.businessType === "product") {
    return "Search product, code, or barcode";
  }

  if (appAccess.businessType === "service") {
    return "Search service or service code";
  }

  return "Search product, service, code, or barcode";
}

function getEmptyCatalogDescription(appAccess: AppAccess) {
  if (appAccess.businessType === "product") {
    return "Add a product so the business can sell it and track stock by location.";
  }

  if (appAccess.businessType === "service") {
    return "Add a service so the business can sell work, time, or appointments.";
  }

  return "Add a product for physical stock or add a service for work the business sells.";
}

function toInt(value: string, fallback = 0) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.round(numberValue));
}

function toCents(value: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numberValue * 100));
}

function fromCents(value: number | null) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(Math.round(value / 100));
}

function money(value: number) {
  return `${Math.round(value / 100).toLocaleString()} RWF`;
}
