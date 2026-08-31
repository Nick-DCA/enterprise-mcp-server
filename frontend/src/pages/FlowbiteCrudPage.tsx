import React, { useState } from 'react';
import { ThemeIcon } from '../theme/ThemeContext.js';

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  technology: string;
  price: string;
  discount: string;
  status: 'In Stock' | 'Low Stock' | 'Active' | 'Enterprise' | 'Draft';
  description: string;
  icon: 'xero' | 'bigquery' | 'firestore' | 'sagehr' | 'products' | 'lightning' | 'shield';
}

const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'PRD-9481',
    name: 'Education Admin Dashboard UI Kit',
    category: 'Html templates',
    technology: 'React, Tailwind CSS',
    price: '$149',
    discount: '15%',
    status: 'In Stock',
    description: 'Complete education management dashboard with student tracking and grade analytics.',
    icon: 'products',
  },
  {
    id: 'PRD-8392',
    name: 'BigQuery Analytics MCP Engine',
    category: 'Cloud SaaS Connectors',
    technology: 'Node.js, Google Cloud',
    price: '$899',
    discount: '0%',
    status: 'Enterprise',
    description: 'High-throughput enterprise SQL analytics adapter with dynamic scan byte caps.',
    icon: 'bigquery',
  },
  {
    id: 'PRD-7261',
    name: 'Flowbite Pro Design System & UI Kit',
    category: 'Design Systems',
    technology: 'Figma, Tailwind UI',
    price: '$299',
    discount: '20%',
    status: 'Active',
    description: 'Over 600+ UI components, interactive charts, and dashboard layouts.',
    icon: 'lightning',
  },
  {
    id: 'PRD-6150',
    name: 'Xero Accounting Master Connector',
    category: 'Financial Integrations',
    technology: 'TypeScript, OAuth 2.0',
    price: '$590',
    discount: '10%',
    status: 'In Stock',
    description: 'Full accounting automation pipeline for invoices, contacts, and payroll reports.',
    icon: 'xero',
  },
  {
    id: 'PRD-5049',
    name: 'Cloud Firestore Realtime Document Store',
    category: 'NoSQL Databases',
    technology: 'Google Cloud, gRPC',
    price: '$450',
    discount: '5%',
    status: 'In Stock',
    description: 'Document querying and field-level sensitive PII redaction layer.',
    icon: 'firestore',
  },
  {
    id: 'PRD-4938',
    name: 'Sage HR Employee & Leave Shield',
    category: 'HR Management',
    technology: 'REST API, Privacy Shield',
    price: '$380',
    discount: '0%',
    status: 'Low Stock',
    description: 'Zero-trust employee directory with compensation and identification masking.',
    icon: 'sagehr',
  },
  {
    id: 'PRD-3827',
    name: 'Enterprise Zero-Exposure Secret Vault',
    category: 'Security & Auth',
    technology: 'Google Secret Manager',
    price: '$1,200',
    discount: '25%',
    status: 'Enterprise',
    description: 'Hardware-backed secret versioning and cryptographic credential vault.',
    icon: 'shield',
  },
  {
    id: 'PRD-2716',
    name: 'Multi-Tenant API Gateway Runner',
    category: 'Server Infrastructure',
    technology: 'Docker, Cloud Run',
    price: '$750',
    discount: '0%',
    status: 'Draft',
    description: 'Containerized server runner supporting single-container React SPA hosting.',
    icon: 'lightning',
  },
];

interface FlowbiteCrudPageProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const FlowbiteCrudPage: React.FC<FlowbiteCrudPageProps> = ({ onShowToast }) => {
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Drawers & Modals
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [activeEditProduct, setActiveEditProduct] = useState<ProductItem | null>(null);
  const [deleteModalProduct, setDeleteModalProduct] = useState<ProductItem | null>(null);

  // Add Product Form State
  const [newProduct, setNewProduct] = useState<Partial<ProductItem>>({
    name: '',
    category: 'Cloud SaaS Connectors',
    technology: 'TypeScript, React',
    price: '$299',
    discount: '0%',
    status: 'Active',
    description: '',
    icon: 'products',
  });

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.technology.toLowerCase().includes(q)
    );
  });

  // Checkbox handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredProducts.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // Bulk Delete
  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setProducts((prev) => prev.filter((p) => !selectedIds.includes(p.id)));
    if (onShowToast) onShowToast(`Removed ${selectedIds.length} selected products`, 'info');
    setSelectedIds([]);
  };

  // Add Product Submit
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name) return;

    const created: ProductItem = {
      id: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
      name: newProduct.name || 'Untitled Product',
      category: newProduct.category || 'General',
      technology: newProduct.technology || 'TypeScript',
      price: newProduct.price || '$99',
      discount: newProduct.discount || '0%',
      status: (newProduct.status as any) || 'Active',
      description: newProduct.description || '',
      icon: (newProduct.icon as any) || 'products',
    };

    setProducts((prev) => [created, ...prev]);
    setIsAddDrawerOpen(false);
    setNewProduct({
      name: '',
      category: 'Cloud SaaS Connectors',
      technology: 'TypeScript, React',
      price: '$299',
      discount: '0%',
      status: 'Active',
      description: '',
      icon: 'products',
    });
    if (onShowToast) onShowToast(`Product "${created.name}" created successfully!`, 'success');
  };

  // Edit Product Submit
  const handleUpdateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEditProduct) return;

    setProducts((prev) =>
      prev.map((p) => (p.id === activeEditProduct.id ? activeEditProduct : p))
    );
    if (onShowToast) onShowToast(`Updated product "${activeEditProduct.name}"`, 'success');
    setActiveEditProduct(null);
  };

  // Delete Confirm
  const handleConfirmDelete = () => {
    if (!deleteModalProduct) return;
    setProducts((prev) => prev.filter((p) => p.id !== deleteModalProduct.id));
    setSelectedIds((prev) => prev.filter((id) => id !== deleteModalProduct.id));
    if (onShowToast) onShowToast(`Deleted "${deleteModalProduct.name}"`, 'info');
    setDeleteModalProduct(null);
  };

  const getStatusBadgeClass = (status: ProductItem['status']) => {
    switch (status) {
      case 'In Stock':
      case 'Active':
        return 'fb-badge-green';
      case 'Enterprise':
        return 'fb-badge-purple';
      case 'Low Stock':
        return 'fb-badge-yellow';
      case 'Draft':
        return 'fb-badge-gray';
      default:
        return 'fb-badge-blue';
    }
  };

  return (
    <div className="fb-page">
      {/* 1. Breadcrumbs */}
      <div className="fb-breadcrumbs">
        <a href="#home">
          <ThemeIcon name="home" size={14} />
          <span>Home</span>
        </a>
        <span>/</span>
        <a href="#ecommerce">E-commerce</a>
        <span>/</span>
        <span className="current">Products</span>
      </div>

      {/* 2. Header Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 className="fb-header-title">
          All Products
          <span className="badge badge-cyan" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
            {products.length} Items
          </span>
        </h2>
      </div>

      {/* 3. Search & Actions Toolbar */}
      <div className="fb-toolbar">
        <div className="fb-toolbar-left">
          {/* Search Box */}
          <div className="fb-search-wrapper">
            <div className="fb-search-icon">
              <ThemeIcon name="search" size={16} />
            </div>
            <input
              type="text"
              className="fb-search-input"
              placeholder="Search for products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Bulk Action Buttons */}
          <button
            className={`fb-icon-btn ${selectedIds.length > 0 ? 'danger' : ''}`}
            title="Delete Selected"
            disabled={selectedIds.length === 0}
            onClick={handleBulkDelete}
            style={{ opacity: selectedIds.length === 0 ? 0.5 : 1 }}
          >
            <ThemeIcon name="trash" size={16} />
          </button>

          <button
            className="fb-icon-btn"
            title="Filter Settings"
            onClick={() => onShowToast && onShowToast('Filter settings opened', 'info')}
          >
            <ThemeIcon name="filter" size={16} />
          </button>

          <button
            className="fb-icon-btn"
            title="Settings"
            onClick={() => onShowToast && onShowToast('Table settings opened', 'info')}
          >
            <ThemeIcon name="cog" size={16} />
          </button>

          <button
            className="fb-icon-btn"
            title="Export CSV"
            onClick={() => onShowToast && onShowToast('Exporting products catalog to CSV...', 'success')}
          >
            <ThemeIcon name="download" size={16} />
          </button>
        </div>

        {/* Right Add Product Button */}
        <div>
          <button className="fb-btn-primary" onClick={() => setIsAddDrawerOpen(true)}>
            <ThemeIcon name="plus" size={16} />
            <span>Add new product</span>
          </button>
        </div>
      </div>

      {/* 4. Products Data Table */}
      <div className="fb-table-container">
        <table className="fb-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length}
                  onChange={handleSelectAll}
                />
              </th>
              <th>PRODUCT NAME</th>
              <th>TECHNOLOGY</th>
              <th>ID</th>
              <th>PRICE</th>
              <th>DISCOUNT</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <tr key={p.id} style={{ background: isSelected ? 'var(--bg-card-hover)' : undefined }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleRow(p.id)}
                    />
                  </td>
                  <td>
                    <div className="fb-product-cell">
                      <div className="fb-product-icon">
                        <ThemeIcon name={p.icon} size={20} />
                      </div>
                      <div>
                        <div className="fb-product-title">{p.name}</div>
                        <div className="fb-product-subtitle">{p.category}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{p.technology}</span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px' }}>
                      {p.id}
                    </code>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.price}</span>
                  </td>
                  <td>
                    <span style={{ color: p.discount !== '0%' ? '#0E9F6E' : 'var(--text-muted)', fontWeight: 600 }}>
                      {p.discount}
                    </span>
                  </td>
                  <td>
                    <span className={`fb-badge ${getStatusBadgeClass(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button
                        className="fb-btn-outline"
                        onClick={() => setActiveEditProduct({ ...p })}
                      >
                        <ThemeIcon name="edit" size={12} />
                        <span>Update</span>
                      </button>
                      <button
                        className="fb-btn-outline fb-btn-outline-danger"
                        onClick={() => setDeleteModalProduct(p)}
                      >
                        <ThemeIcon name="trash" size={12} />
                        <span>Delete item</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No products matched your search query.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 5. Pagination Footer */}
        <div className="fb-pagination">
          <div>
            Showing <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>1-{filteredProducts.length}</span> of{' '}
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{products.length}</span> products
          </div>
          <div className="fb-pagination-buttons">
            <button className="fb-btn-outline" onClick={() => onShowToast && onShowToast('Previous page', 'info')}>
              <ThemeIcon name="chevronLeft" size={14} />
              <span>Previous</span>
            </button>
            <button className="fb-btn-outline" onClick={() => onShowToast && onShowToast('Next page', 'info')}>
              <span>Next</span>
              <ThemeIcon name="chevronRight" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Add Product Slide-Over Drawer */}
      {isAddDrawerOpen && (
        <div className="fb-drawer-overlay" onClick={() => setIsAddDrawerOpen(false)}>
          <div className="fb-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="fb-drawer-header">
              <h3>New Product</h3>
              <button className="fb-drawer-close" onClick={() => setIsAddDrawerOpen(false)}>
                <ThemeIcon name="xmark" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Sage HR Leave Tracker"
                  value={newProduct.name || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-input"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                >
                  <option value="Cloud SaaS Connectors">Cloud SaaS Connectors</option>
                  <option value="Html templates">Html templates</option>
                  <option value="Design Systems">Design Systems</option>
                  <option value="Financial Integrations">Financial Integrations</option>
                  <option value="Security & Auth">Security & Auth</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Price</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="$299"
                    value={newProduct.price || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="10%"
                    value={newProduct.discount || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, discount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={newProduct.status}
                  onChange={(e) => setNewProduct({ ...newProduct, status: e.target.value as any })}
                >
                  <option value="In Stock">In Stock</option>
                  <option value="Active">Active</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Enter detailed product specifications..."
                  value={newProduct.description || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '1.5rem' }}>
                <button type="submit" className="fb-btn-primary" style={{ flex: 1 }}>
                  <span>Add product</span>
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddDrawerOpen(false)}>
                  <span>Cancel</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Update Product Slide-Over Drawer */}
      {activeEditProduct && (
        <div className="fb-drawer-overlay" onClick={() => setActiveEditProduct(null)}>
          <div className="fb-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="fb-drawer-header">
              <h3>Update Product</h3>
              <button className="fb-drawer-close" onClick={() => setActiveEditProduct(null)}>
                <ThemeIcon name="xmark" size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={activeEditProduct.name}
                  onChange={(e) => setActiveEditProduct({ ...activeEditProduct, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <input
                  type="text"
                  className="form-input"
                  value={activeEditProduct.category}
                  onChange={(e) => setActiveEditProduct({ ...activeEditProduct, category: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Price</label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeEditProduct.price}
                    onChange={(e) => setActiveEditProduct({ ...activeEditProduct, price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount</label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeEditProduct.discount}
                    onChange={(e) => setActiveEditProduct({ ...activeEditProduct, discount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={activeEditProduct.status}
                  onChange={(e) => setActiveEditProduct({ ...activeEditProduct, status: e.target.value as any })}
                >
                  <option value="In Stock">In Stock</option>
                  <option value="Active">Active</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={activeEditProduct.description}
                  onChange={(e) => setActiveEditProduct({ ...activeEditProduct, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '1.5rem' }}>
                <button type="submit" className="fb-btn-primary" style={{ flex: 1 }}>
                  <span>Save changes</span>
                </button>
                <button
                  type="button"
                  className="fb-btn-danger"
                  onClick={() => {
                    const toDelete = activeEditProduct;
                    setActiveEditProduct(null);
                    setDeleteModalProduct(toDelete);
                  }}
                >
                  <span>Delete</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Delete Confirmation Modal */}
      {deleteModalProduct && (
        <div className="fb-modal-overlay" onClick={() => setDeleteModalProduct(null)}>
          <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fb-modal-icon">
              <ThemeIcon name="alert" size={28} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Are you sure you want to delete this product?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              You are about to permanently delete <strong>{deleteModalProduct.name}</strong> ({deleteModalProduct.id}). This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button className="fb-btn-danger" onClick={handleConfirmDelete}>
                <span>Yes, I'm sure</span>
              </button>
              <button className="btn btn-secondary" onClick={() => setDeleteModalProduct(null)}>
                <span>No, cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
