export interface MarketplaceExtension {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  repository: string;
  icon?: string;
  tags: string[];
  downloads: number;
  rating: number;
  updatedAt: string;
  homepage?: string;
  license?: string;
}

export interface MarketplaceRegistry {
  schema: number;
  updatedAt: string;
  extensions: MarketplaceExtension[];
}
