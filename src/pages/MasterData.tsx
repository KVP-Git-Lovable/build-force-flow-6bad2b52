import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Handshake, ListChecks, FolderTree, Package, MapPin, Target, Tags, Ruler } from "lucide-react";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";

const allMasterModules = [
  {
    title: "Vendor Master",
    description: "Manage vendors, contacts, and supplier information",
    icon: Handshake,
    color: "bg-amber-100 text-amber-600",
    path: "/vendors",
    module: null as string | null,
  },
  {
    title: "Activity Type Master",
    description: "Configure activity types and their settings",
    icon: ListChecks,
    color: "bg-green-100 text-green-600",
    path: "/activity-types",
    module: "module_activities" as string | null,
  },
  {
    title: "Category Master",
    description: "Manage product categories and sub categories",
    icon: FolderTree,
    color: "bg-cyan-100 text-cyan-600",
    path: "/master-data/categories",
    module: null as string | null,
  },
  {
    title: "Product Master",
    description: "Manage products linked to categories",
    icon: Package,
    color: "bg-violet-100 text-violet-600",
    path: "/master-data/products",
    module: null as string | null,
  },
  {
    title: "Address Book",
    description: "Manage billing & delivery addresses for purchase orders",
    icon: MapPin,
    color: "bg-rose-100 text-rose-600",
    path: "/master-data/addresses",
    module: null as string | null,
  },
  {
    title: "Opportunity Stages",
    description: "Manage sales pipeline stages and colors",
    icon: Target,
    color: "bg-fuchsia-100 text-fuchsia-600",
    path: "/master-data/opportunity-stages",
    module: "module_opportunities" as string | null,
  },
  {
    title: "Opportunity Types",
    description: "Manage opportunity types (Upsell, Renewal, New…)",
    icon: Tags,
    color: "bg-sky-100 text-sky-600",
    path: "/master-data/opportunity-types",
    module: "module_opportunities" as string | null,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function MasterData() {
  const navigate = useNavigate();
  const { hasModuleAccess } = useProfilePermissions();

  const visibleModules = useMemo(
    () => allMasterModules.filter((m) => !m.module || hasModuleAccess(m.module)),
    [hasModuleAccess]
  );

  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Master Data</h1>
        <p className="text-sm text-muted-foreground">
          Manage master and configuration data in one place
        </p>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          return (
            <Card
              key={module.path}
              className="cursor-pointer hover:shadow-elevated transition-shadow"
              onClick={() => navigate(module.path)}
            >
              <CardHeader className="text-center pb-2">
                <div className={`mx-auto mb-3 p-4 rounded-full w-16 h-16 flex items-center justify-center ${module.color}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <CardTitle className="text-base">{module.title}</CardTitle>
                <CardDescription className="text-xs">{module.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}

        {visibleModules.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground text-sm">No master data modules available</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
