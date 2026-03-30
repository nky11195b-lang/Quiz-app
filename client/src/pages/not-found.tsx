import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SearchX, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="w-24 h-24 bg-muted rounded-[2rem] flex items-center justify-center mb-8 rotate-12"
        >
          <SearchX className="w-10 h-10 text-muted-foreground" />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl font-display font-bold mb-4"
        >
          Page Not Found
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-muted-foreground max-w-md mx-auto mb-10"
        >
          We couldn't find the page you were looking for. It might have been moved or deleted.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Link href="/" className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 transition-all duration-300 flex items-center gap-2">
            Return Home <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>
      </div>
    </Layout>
  );
}
